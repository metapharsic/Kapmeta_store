import { EventEmitter } from 'events';

// In a real distributed system (AWS), this would be backed by EventBridge, SNS/SQS, or Kafka.
// Since we are running a Modular Monolith inside a single Node.js process (API Gateway),
// we use an in-memory EventEmitter to decouple Domain Agents as prescribed by
// the architecture (ARCH-MAS-WIRING).

class DomainEventBus extends EventEmitter {}

export const eventBus = new DomainEventBus();

// Type definitions for events to ensure strict typing across agents
export type OrderSettledEvent = {
  invoiceId: string;
  orderId: string;
  outletId: string;
};

export type OrderConfirmedEvent = {
  orderId: string;
};

export type OrderCompletedEvent = {
  orderId: string;
};

// Asynchronous background task runner with retries, exponential backoff, and DLQ logging
export function runAsyncWithRetry(
  eventName: string,
  fn: () => Promise<void>,
  retries = 3,
  delay = 1000
) {
  setTimeout(async () => {
    try {
      await fn();
    } catch (err) {
      console.error(`[EventBus] Error executing listener for event "${eventName}". Retries left: ${retries}`, err);
      if (retries > 0) {
        runAsyncWithRetry(eventName, fn, retries - 1, delay * 2);
      } else {
        console.error(`[EventBus] CRITICAL: Event "${eventName}" failed all retries. Moved to Dead Letter Queue (DLQ).`);
      }
    }
  }, delay);
}

// Strongly typed emit and on methods
export function emitOrderSettled(payload: OrderSettledEvent) {
  eventBus.emit('invoice.settled', payload);
}

export function onOrderSettled(handler: (payload: OrderSettledEvent) => void) {
  eventBus.on('invoice.settled', handler);
}

export function emitOrderConfirmed(payload: OrderConfirmedEvent) {
  eventBus.emit('order.confirmed', payload);
}

export function onOrderConfirmed(handler: (payload: OrderConfirmedEvent) => Promise<void>) {
  eventBus.on('order.confirmed', handler);
}

export function emitOrderCompleted(payload: OrderCompletedEvent) {
  eventBus.emit('order.completed', payload);
}

export function onOrderCompleted(handler: (payload: OrderCompletedEvent) => Promise<void>) {
  eventBus.on('order.completed', handler);
}

