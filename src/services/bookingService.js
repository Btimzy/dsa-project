// Booking domain service handling ticket booking, payment processing, and cancellations.
// Reuses booking finite state machine and ID generators from domain.

import { DomainError } from '../domain/errors.js';
import { newId, newReference } from '../domain/ids.js';
import { BOOKING_STATES, assertTransition } from '../domain/bookingStateMachine.js';

export const MAX_TICKETS_PER_BOOKING = 10;

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainError('VALIDATION', `${field} is required`);
  }
  return value.trim();
}

export class BookingService {
  #repo;
  #paymentGateway;

  constructor(repo, paymentGateway) {
    if (!repo) {
      throw new TypeError('A repository instance is required by BookingService');
    }
    if (!paymentGateway) {
      throw new TypeError('A payment gateway instance is required by BookingService');
    }
    this.#repo = repo;
    this.#paymentGateway = paymentGateway;
  }

  async bookTickets(userId, input = {}) {
    const cleanUserId = requireText(userId, 'User ID');
    const { tierId, quantity } = input || {};
    const cleanTierId = requireText(tierId, 'Tier ID');

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_BOOKING) {
      throw new DomainError('VALIDATION', `quantity must be between 1 and ${MAX_TICKETS_PER_BOOKING}`);
    }

    const tier = await this.#repo.findTierById(cleanTierId);
    if (!tier) {
      throw new DomainError('NOT_FOUND', `Tier ${cleanTierId} not found`);
    }

    const event = await this.#repo.findEventById(tier.eventId);
    if (!event || event.status !== 'published') {
      throw new DomainError('INVALID_STATE', 'Cannot book tickets for an event that is not published');
    }

    const seatsLeft = tier.capacity - tier.sold;
    if (seatsLeft < quantity) {
      const message = seatsLeft === 0
        ? `${tier.name} is sold out`
        : `Only ${seatsLeft} ticket(s) left in ${tier.name}`;
      throw new DomainError('SOLD_OUT', message, { seatsLeft });
    }

    const amountCents = tier.priceCents * quantity;
    if (!Number.isSafeInteger(amountCents)) {
      throw new DomainError('VALIDATION', 'Booking amount exceeds supported whole-cent range');
    }

    // Atomic seat reservation if repository supports it (Build 5 overselling fix)
    if (typeof this.#repo.reserveSeats === 'function' && this.#repo.useAtomicReservation !== false) {
      const wonSeat = await this.#repo.reserveSeats(tier.id, quantity);
      if (!wonSeat) {
        throw new DomainError('SOLD_OUT', `${tier.name} is sold out`, { seatsLeft: 0 });
      }
    } else {
      // Non-atomic read-then-write fallback (reproduces overselling under concurrency)
      await this.#repo.updateTier(tier.id, { sold: tier.sold + quantity });
    }

    let reference;
    do {
      reference = newReference();
    } while (await this.#repo.findBookingByReference(reference));

    const booking = {
      id: newId(),
      reference,
      userId: cleanUserId,
      tierId: tier.id,
      eventId: tier.eventId,
      quantity,
      amountCents,
      status: BOOKING_STATES.PENDING,
      createdAt: new Date().toISOString(),
    };

    await this.#repo.createBooking(booking);

    return booking;
  }

  async payBooking(userId, reference, paymentDetails = {}) {
    const cleanUserId = requireText(userId, 'User ID');
    const cleanReference = requireText(reference, 'Booking reference');

    const booking = await this.#repo.findBookingByReference(cleanReference);
    if (!booking) {
      throw new DomainError('NOT_FOUND', `Booking ${cleanReference} not found`);
    }

    if (booking.userId !== cleanUserId) {
      throw new DomainError('FORBIDDEN', 'You are not authorized to pay for this booking');
    }

    // State machine check: pending -> paid is allowed.
    // If already paid or cancelled, throws INVALID_TRANSITION before charging the card.
    assertTransition(booking.status, BOOKING_STATES.PAID);

    const chargeResult = await this.#paymentGateway.charge({
      amountCents: booking.amountCents,
      currency: 'kobo',
      shouldDecline: Boolean(paymentDetails?.shouldDecline),
      declineReason: paymentDetails?.declineReason || 'Card declined',
    });

    if (!chargeResult.success || chargeResult.declined) {
      // Booking remains in pending state when payment is declined
      throw new DomainError('PAYMENT_DECLINED', chargeResult.reason || 'Payment was declined by payment gateway');
    }

    const updatedBooking = await this.#repo.updateBooking(booking.id, {
      status: BOOKING_STATES.PAID,
      paidAt: chargeResult.chargedAt || new Date().toISOString(),
      transactionId: chargeResult.transactionId,
    });

    return {
      booking: updatedBooking,
      payment: chargeResult,
    };
  }

  async cancelBooking(userId, reference) {
    const cleanUserId = requireText(userId, 'User ID');
    const cleanReference = requireText(reference, 'Booking reference');

    const booking = await this.#repo.findBookingByReference(cleanReference);
    if (!booking) {
      throw new DomainError('NOT_FOUND', `Booking ${cleanReference} not found`);
    }

    if (booking.userId !== cleanUserId) {
      throw new DomainError('FORBIDDEN', 'You are not authorized to cancel this booking');
    }

    if (booking.status === BOOKING_STATES.PAID) {
      throw new DomainError('INVALID_STATE', 'Only unpaid bookings can be cancelled in this build');
    }

    // State machine transition check
    assertTransition(booking.status, BOOKING_STATES.CANCELLED);

    // Release seats
    if (typeof this.#repo.releaseSeats === 'function' && this.#repo.useAtomicReservation !== false) {
      await this.#repo.releaseSeats(booking.tierId, booking.quantity);
    } else {
      const tier = await this.#repo.findTierById(booking.tierId);
      if (tier) {
        const updatedSold = Math.max(0, tier.sold - booking.quantity);
        await this.#repo.updateTier(tier.id, { sold: updatedSold });
      }
    }

    const updatedBooking = await this.#repo.updateBooking(booking.id, {
      status: BOOKING_STATES.CANCELLED,
      cancelledAt: new Date().toISOString(),
    });

    return updatedBooking;
  }

  async getBookingByReference(userId, reference) {
    const cleanUserId = requireText(userId, 'User ID');
    const cleanReference = requireText(reference, 'Booking reference');

    const booking = await this.#repo.findBookingByReference(cleanReference);
    if (!booking) {
      throw new DomainError('NOT_FOUND', `Booking ${cleanReference} not found`);
    }

    if (booking.userId !== cleanUserId) {
      throw new DomainError('FORBIDDEN', 'You are not authorized to view this booking');
    }

    return booking;
  }
}

export function createBookingService(repo, paymentGateway) {
  return new BookingService(repo, paymentGateway);
}
