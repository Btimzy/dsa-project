import { DomainError } from './errors.js';

export const BOOKING_STATES = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
  CHECKED_IN: 'checked_in',
});

// Allowed state transitions lookup table
export const ALLOWED_TRANSITIONS = Object.freeze({
  [BOOKING_STATES.PENDING]: new Set([BOOKING_STATES.PAID, BOOKING_STATES.CANCELLED]),
  [BOOKING_STATES.PAID]: new Set([BOOKING_STATES.CHECKED_IN, BOOKING_STATES.REFUNDED, BOOKING_STATES.CANCELLED]),
  [BOOKING_STATES.CANCELLED]: new Set(),
  [BOOKING_STATES.REFUNDED]: new Set(),
  [BOOKING_STATES.CHECKED_IN]: new Set(),
});

export function canTransition(fromState, toState) {
  const allowed = ALLOWED_TRANSITIONS[fromState];
  if (!allowed) {
    return false;
  }
  return allowed.has(toState);
}

export function assertTransition(fromState, toState) {
  if (!canTransition(fromState, toState)) {
    throw new DomainError(
      'INVALID_TRANSITION',
      `Cannot transition booking from "${fromState}" to "${toState}"`,
      { from: fromState, to: toState }
    );
  }
}
