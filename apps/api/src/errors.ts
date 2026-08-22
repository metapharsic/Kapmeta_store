// apps/api/src/errors.ts
//
// Maps the real error classes each service package throws to HTTP status
// codes, so route handlers can just `throw` and let the error-handling
// middleware in app.ts translate it — no 500s leaking for expected,
// typed domain errors.

export interface HttpErrorMapping {
  status: number;
  body: { error: string; message: string };
}

/** Returns the HTTP mapping for a known domain error, or undefined for
 * anything unrecognized (the caller should then fall back to a 500). */
export function mapDomainError(err: unknown): HttpErrorMapping | undefined {
  if (err && typeof err === 'object' && 'name' in err && 'message' in err) {
    const errorObj = err as Error;
    if (['OrderNotFoundError', 'TableNotFoundError', 'NotFoundError'].includes(errorObj.name)) {
      return { status: 404, body: { error: errorObj.name, message: errorObj.message } };
    }
    if (errorObj.name === 'InvalidStatusTransitionError') {
      return { status: 409, body: { error: errorObj.name, message: errorObj.message } };
    }
    if (errorObj.name === 'ForbiddenError') {
      return { status: 403, body: { error: errorObj.name, message: errorObj.message } };
    }
    if (['ConfirmationRequiredError', 'InvalidConfirmationPhraseError'].includes(errorObj.name)) {
      return { status: 400, body: { error: errorObj.name, message: errorObj.message } };
    }
  }
  if (err instanceof Error) {
    // Generic thrown Errors from service layers that aren't a dedicated
    // class (e.g. OrdersService's `throw new Error('Cannot add items...')`)
    // are surfaced as 409 Conflict — they are always business-rule
    // violations against current state, never unexpected server faults.
    const conflictPatterns = [
      /^Cannot /,
      /already has an active order/,
      /has no active (order|session)/,
      /has no items to move/,
      /not found/i,
      /requires a non-empty reason/,
      /^One or more/,
      /^Cannot split/,
      /same table/,
    ];
    if (conflictPatterns.some((re) => re.test(err.message))) {
      return { status: 409, body: { error: 'ConflictError', message: err.message } };
    }
  }
  return undefined;
}
