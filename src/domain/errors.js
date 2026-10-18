// Machine-readable domain error codes: VALIDATION, NOT_FOUND, SOLD_OUT, NOT_SOLD_OUT, INVALID_STATE
export class DomainError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}
