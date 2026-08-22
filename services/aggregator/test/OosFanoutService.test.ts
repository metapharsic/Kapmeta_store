import { describe, it, expect } from 'vitest';
import { OosFanoutService, type SwiggyClient, type ZomatoClient, type OosLogger } from '../src/OosFanoutService';

class OkSwiggyClient implements SwiggyClient {
  async markItemOutOfStock(): Promise<void> {
    // succeeds
  }
}

class FailingZomatoClient implements ZomatoClient {
  async markItemOutOfStock(): Promise<void> {
    throw new Error('Zomato catalog API returned 500');
  }
}

class OkZomatoClient implements ZomatoClient {
  async markItemOutOfStock(): Promise<void> {
    // succeeds
  }
}

class FailingSwiggyClient implements SwiggyClient {
  async markItemOutOfStock(): Promise<void> {
    throw new Error('Swiggy catalog API timed out');
  }
}

function makeSilentLogger(): OosLogger & { calls: Array<{ message: string; meta?: Record<string, unknown> }> } {
  const calls: Array<{ message: string; meta?: Record<string, unknown> }> = [];
  return {
    calls,
    warn(message, meta) {
      calls.push({ message, meta });
    },
  };
}

describe('OosFanoutService.markOutOfStock', () => {
  it('returns empty result when propagateToOtherChannels is false', async () => {
    const service = new OosFanoutService({
      swiggyClient: new OkSwiggyClient(),
      zomatoClient: new OkZomatoClient(),
    });
    const results = await service.markOutOfStock('menu_1', 'outlet_1', {
      itemId: 'menu_1',
      outletId: 'outlet_1',
      altItemAllowed: true,
      propagateToOtherChannels: false,
    });
    expect(results).toEqual([]);
  });

  it('reports success on both channels when both succeed', async () => {
    const service = new OosFanoutService({
      swiggyClient: new OkSwiggyClient(),
      zomatoClient: new OkZomatoClient(),
    });
    const results = await service.markOutOfStock('menu_1', 'outlet_1', {
      itemId: 'menu_1',
      outletId: 'outlet_1',
      altItemAllowed: false,
      propagateToOtherChannels: true,
    });
    expect(results).toEqual([
      { channel: 'swiggy', success: true },
      { channel: 'zomato', success: true },
    ]);
  });

  it('reports partial failure: zomato fails, swiggy succeeds, both surfaced and never throws', async () => {
    const logger = makeSilentLogger();
    const service = new OosFanoutService({
      swiggyClient: new OkSwiggyClient(),
      zomatoClient: new FailingZomatoClient(),
      logger,
    });

    const results = await service.markOutOfStock('menu_1', 'outlet_1', {
      itemId: 'menu_1',
      outletId: 'outlet_1',
      altItemAllowed: true,
      propagateToOtherChannels: true,
    });

    expect(results).toEqual([
      { channel: 'swiggy', success: true },
      { channel: 'zomato', success: false, error: 'Zomato catalog API returned 500' },
    ]);
    expect(logger.calls.length).toBe(1);
    expect(logger.calls[0].message).toMatch(/Zomato/);
  });

  it('reports partial failure: swiggy fails, zomato succeeds, both surfaced and never throws', async () => {
    const logger = makeSilentLogger();
    const service = new OosFanoutService({
      swiggyClient: new FailingSwiggyClient(),
      zomatoClient: new OkZomatoClient(),
      logger,
    });

    const results = await service.markOutOfStock('menu_1', 'outlet_1', {
      itemId: 'menu_1',
      outletId: 'outlet_1',
      altItemAllowed: true,
      propagateToOtherChannels: true,
    });

    expect(results).toEqual([
      { channel: 'swiggy', success: false, error: 'Swiggy catalog API timed out' },
      { channel: 'zomato', success: true },
    ]);
    expect(logger.calls.length).toBe(1);
    expect(logger.calls[0].message).toMatch(/Swiggy/);
  });
});
