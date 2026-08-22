// services/admin/src/errors.ts

export class ForbiddenError extends Error {
  constructor(message = 'Actor does not have permission to perform this action') {
    super(message);
    this.name = 'ForbiddenError';
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export class ConfirmationRequiredError extends Error {
  constructor(message = 'This destructive action requires confirm: true') {
    super(message);
    this.name = 'ConfirmationRequiredError';
    Object.setPrototypeOf(this, ConfirmationRequiredError.prototype);
  }
}

export class InvalidConfirmationPhraseError extends Error {
  constructor(message = 'The confirmation phrase does not match the expected value') {
    super(message);
    this.name = 'InvalidConfirmationPhraseError';
    Object.setPrototypeOf(this, InvalidConfirmationPhraseError.prototype);
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}
