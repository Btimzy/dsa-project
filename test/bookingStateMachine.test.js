import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOKING_STATES,
  canTransition,
  assertTransition,
} from '../src/domain/bookingStateMachine.js';
import { DomainError } from '../src/domain/errors.js';

test('bookingStateMachine - allows all valid transitions', () => {
  const allowedMoves = [
    [BOOKING_STATES.PENDING, BOOKING_STATES.PAID],
    [BOOKING_STATES.PENDING, BOOKING_STATES.CANCELLED],
    [BOOKING_STATES.PAID, BOOKING_STATES.CHECKED_IN],
    [BOOKING_STATES.PAID, BOOKING_STATES.REFUNDED],
    [BOOKING_STATES.PAID, BOOKING_STATES.CANCELLED],
  ];

  for (const [from, to] of allowedMoves) {
    assert.equal(canTransition(from, to), true, `Expected ${from} -> ${to} to be allowed`);
    assert.doesNotThrow(() => assertTransition(from, to), `Expected ${from} -> ${to} not to throw`);
  }
});

test('bookingStateMachine - rejects illegal moves from pending and paid', () => {
  const illegalMoves = [
    [BOOKING_STATES.PENDING, BOOKING_STATES.REFUNDED],
    [BOOKING_STATES.PENDING, BOOKING_STATES.CHECKED_IN],
    [BOOKING_STATES.PAID, BOOKING_STATES.PENDING],
  ];

  for (const [from, to] of illegalMoves) {
    assert.equal(canTransition(from, to), false, `Expected ${from} -> ${to} to be refused`);
    assert.throws(
      () => assertTransition(from, to),
      (err) => err instanceof DomainError && err.code === 'INVALID_TRANSITION',
      `Expected INVALID_TRANSITION error for ${from} -> ${to}`
    );
  }
});

test('bookingStateMachine - terminal states (cancelled, refunded, checked_in) cannot transition anywhere', () => {
  const terminalStates = [
    BOOKING_STATES.CANCELLED,
    BOOKING_STATES.REFUNDED,
    BOOKING_STATES.CHECKED_IN,
  ];
  const allStates = Object.values(BOOKING_STATES);

  for (const terminal of terminalStates) {
    for (const target of allStates) {
      assert.equal(
        canTransition(terminal, target),
        false,
        `Expected terminal state ${terminal} -> ${target} to be refused`
      );
      assert.throws(
        () => assertTransition(terminal, target),
        (err) => err instanceof DomainError && err.code === 'INVALID_TRANSITION'
      );
    }
  }
});

test('bookingStateMachine - unknown states are rejected with INVALID_TRANSITION', () => {
  assert.equal(canTransition('unknown_state', BOOKING_STATES.PAID), false);
  assert.throws(
    () => assertTransition('unknown_state', BOOKING_STATES.PAID),
    (err) => err instanceof DomainError && err.code === 'INVALID_TRANSITION'
  );
  assert.throws(
    () => assertTransition(BOOKING_STATES.PENDING, 'non_existent_target'),
    (err) => err instanceof DomainError && err.code === 'INVALID_TRANSITION'
  );
});
