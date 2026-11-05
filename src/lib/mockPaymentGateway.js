// Simulated payment gateway for mock payments.
// Never accepts or logs sensitive financial details like card numbers.

export class MockPaymentGateway {
  async charge({ amountCents, currency = 'kobo', shouldDecline = false, declineReason = 'Card declined' } = {}) {
    if (shouldDecline) {
      return {
        success: false,
        declined: true,
        reason: declineReason,
      };
    }

    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    return {
      success: true,
      transactionId,
      amountCents,
      currency,
      chargedAt: new Date().toISOString(),
    };
  }
}

export function createMockPaymentGateway() {
  return new MockPaymentGateway();
}
