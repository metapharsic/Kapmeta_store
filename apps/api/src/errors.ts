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

// ---------------------------------------------------------------------------
// Unexpected-error responses (INC: "internal error" on Save Company Details)
// ---------------------------------------------------------------------------
// Route catch blocks used to answer every unexpected failure with a bare
// `{ error: "internal error" }`. That hid a very diagnosable class of fault —
// the generated Prisma client / Postgres schema being behind the application
// code — behind a string that gave the operator no path forward. These helpers
// classify the error, log it in full server-side, and return a stable
// machine-readable `code` plus an actionable human `error` message, without
// ever leaking stack traces, SQL or connection strings to the client.

export type ServerErrorCode = 'SCHEMA_OUT_OF_SYNC' | 'DB_UNAVAILABLE' | 'INTERNAL_ERROR';

export interface ServerErrorResponse {
  status: number;
  body: { code: ServerErrorCode; error: string; detail?: string };
}

/** Only bare identifiers are ever echoed back to a client. */
const SAFE_IDENTIFIER = /^[A-Za-z0-9_.]{1,64}$/;

function readString(source: unknown, key: string): string {
  if (source && typeof source === 'object' && key in (source as Record<string, unknown>)) {
    const value = (source as Record<string, unknown>)[key];
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
  }
  return '';
}

/** Pull the offending column/argument name out of a schema-mismatch message,
 * if it can be recovered safely. Returns undefined rather than risk echoing
 * raw SQL or a connection string back to the caller. */
function schemaSubject(message: string): string | undefined {
  const patterns = [
    /Unknown argument[s]?\s+[`'"]?([A-Za-z0-9_.]+)/i,
    /Unknown arg\s+[`'"]?([A-Za-z0-9_.]+)/i,
    /Unknown field\s+[`'"]?([A-Za-z0-9_.]+)/i,
    /column\s+[`'"]?([A-Za-z0-9_.]+)/i,
    /relation\s+[`'"]?([A-Za-z0-9_.]+)/i,
  ];
  for (const re of patterns) {
    const match = re.exec(message);
    if (match && SAFE_IDENTIFIER.test(match[1])) return match[1];
  }
  return undefined;
}

// Postgres: 42703 undefined_column, 42P01 undefined_table, 42883 undefined_function.
// Prisma:   P2021 table does not exist, P2022 column does not exist.
const SCHEMA_MISMATCH_CODES = ['42703', '42P01', '42883', 'P2021', 'P2022'];

// Prisma P1xxx = cannot reach / authenticate against the database.
// Postgres 57P01 admin shutdown, 53300 too many connections.
const DB_UNAVAILABLE_CODES = [
  'P1000', 'P1001', 'P1002', 'P1003', 'P1008', 'P1010', 'P1017',
  '57P01', '53300', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
];

/** Classify an unexpected error into the status + safe body to return. */
export function classifyServerError(err: unknown): ServerErrorResponse {
  const message =
    typeof err === 'string' ? err : err instanceof Error ? err.message : readString(err, 'message');
  const name = err instanceof Error ? err.name : readString(err, 'name');
  const code = readString(err, 'code');
  const metaCode =
    err && typeof err === 'object' ? readString((err as Record<string, unknown>).meta, 'code') : '';

  const isSchemaMismatch =
    SCHEMA_MISMATCH_CODES.includes(code) ||
    SCHEMA_MISMATCH_CODES.includes(metaCode) ||
    /unknown\s+arg(ument)?s?\b/i.test(message) ||
    /unknown\s+field\b/i.test(message) ||
    /column .*does not exist/i.test(message) ||
    /relation .*does not exist/i.test(message) ||
    /does not exist in the current database/i.test(message) ||
    (name === 'PrismaClientValidationError' && /unknown|available options/i.test(message));

  if (isSchemaMismatch) {
    const subject = schemaSubject(message);
    return {
      status: 503,
      body: {
        code: 'SCHEMA_OUT_OF_SYNC',
        error:
          "The database schema is behind the application code. Run 'npx prisma generate' and 'npm run db:migrate', then retry.",
        ...(subject ? { detail: `Unrecognized field or column: ${subject}` } : {}),
      },
    };
  }

  if (
    DB_UNAVAILABLE_CODES.includes(code) ||
    DB_UNAVAILABLE_CODES.includes(metaCode) ||
    name === 'PrismaClientInitializationError'
  ) {
    return {
      status: 503,
      body: {
        code: 'DB_UNAVAILABLE',
        error:
          'The database is unreachable. Check that Postgres is running and that the API has a valid DATABASE_URL, then retry.',
      },
    };
  }

  return {
    status: 500,
    body: {
      code: 'INTERNAL_ERROR',
      error: 'Unexpected server error. Check the API server logs for the full details.',
    },
  };
}

/**
 * Log `err` in full server-side and answer the request with an actionable,
 * non-leaking error body. Use this instead of a bare
 * `res.status(500).json({ error: "internal error" })`.
 *
 * @param context short route label included in the server-side log line only.
 */
export function sendServerError(res: any, err: unknown, context?: string): void {
  console.error(context ? `[${context}] request failed:` : '[api] request failed:', err);
  const { status, body } = classifyServerError(err);
  res.status(status).json(body);
}
