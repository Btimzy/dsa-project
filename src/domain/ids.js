import { randomBytes, randomUUID } from 'node:crypto';

// 32 unambiguous characters without easily confused digits/letters (no 0, O, 1, I, L).
// Because 256 is divisible by 32 (256 % 32 === 0), `byte % 32` has zero statistical bias.
const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export function newId() {
  return randomUUID();
}

export function newReference(length = 8) {
  const bytes = randomBytes(length);
  let reference = '';
  for (const byte of bytes) {
    reference += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  }
  return reference;
}
