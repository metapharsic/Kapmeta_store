import type { ChannelResult, OosMarkInput } from './types';

/**
 * Minimal client interfaces for pushing out-of-stock state to each
 * aggregator platform. Real implementations call the platform's catalog
 * API; these are injected so OosFanoutService is testable without network
 * access.
 */
export interface SwiggyClient {
  markItemOutOfStock(itemId: string, outletId: string, altItemAllowed: boolean): Promise<void>;
}

export interface ZomatoClient {
  markItemOutOfStock(itemId: string, outletId: string, altItemAllowed: boolean): Promise<void>;
}

export interface OosLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
}

const consoleLogger: OosLogger = {
  warn: (message, meta) => console.warn(message, meta),
};

export interface OosFanoutServiceDeps {
  swiggyClient: SwiggyClient;
  zomatoClient: ZomatoClient;
  logger?: OosLogger;
}

/**
 * Stub client implementations. Do nothing but satisfy the interface — real
 * platform HTTP calls are wired in at the app layer.
 */
export class StubSwiggyClient implements SwiggyClient {
  async markItemOutOfStock(): Promise<void> {
    // no-op stub
  }
}

export class StubZomatoClient implements ZomatoClient {
  async markItemOutOfStock(): Promise<void> {
    // no-op stub
  }
}

/**
 * Fans out an out-of-stock mark to every aggregator channel that opted in
 * (propagateToOtherChannels). Each channel is attempted independently — a
 * failure on one platform never prevents the other from being attempted or
 * throws out of markOutOfStock; failures are logged and surfaced in the
 * returned per-channel result array instead.
 */
export class OosFanoutService {
  private readonly swiggyClient: SwiggyClient;
  private readonly zomatoClient: ZomatoClient;
  private readonly logger: OosLogger;

  constructor(deps: OosFanoutServiceDeps) {
    this.swiggyClient = deps.swiggyClient;
    this.zomatoClient = deps.zomatoClient;
    this.logger = deps.logger ?? consoleLogger;
  }

  async markOutOfStock(itemId: string, outletId: string, input: OosMarkInput): Promise<ChannelResult[]> {
    if (!input.propagateToOtherChannels) {
      return [];
    }

    const results: ChannelResult[] = [];

    await Promise.all([
      this.swiggyClient
        .markItemOutOfStock(itemId, outletId, input.altItemAllowed)
        .then(() => {
          results.push({ channel: 'swiggy', success: true });
        })
        .catch((err: unknown) => {
          const error = err instanceof Error ? err.message : String(err);
          this.logger.warn('Failed to mark item OOS on Swiggy', { itemId, outletId, error });
          results.push({ channel: 'swiggy', success: false, error });
        }),
      this.zomatoClient
        .markItemOutOfStock(itemId, outletId, input.altItemAllowed)
        .then(() => {
          results.push({ channel: 'zomato', success: true });
        })
        .catch((err: unknown) => {
          const error = err instanceof Error ? err.message : String(err);
          this.logger.warn('Failed to mark item OOS on Zomato', { itemId, outletId, error });
          results.push({ channel: 'zomato', success: false, error });
        }),
    ]);

    // Stable channel ordering regardless of async completion order.
    return results.sort((a, b) => (a.channel < b.channel ? -1 : a.channel > b.channel ? 1 : 0));
  }
}
