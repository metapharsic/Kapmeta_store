import type { ChannelAdapter, ChannelCode } from "@kapmeta/shared-types/channel";

// Channel Account Manager's adapter half: one adapter instance per channel
// code, registered at boot. Hub core never imports a partner adapter by name.
export class AdapterRegistry {
  private readonly adapters = new Map<ChannelCode, ChannelAdapter>();

  register(adapter: ChannelAdapter): void {
    if (this.adapters.has(adapter.channel)) {
      throw new Error(`adapter already registered for channel ${adapter.channel}`);
    }
    this.adapters.set(adapter.channel, adapter);
  }

  get(channel: ChannelCode): ChannelAdapter {
    const adapter = this.adapters.get(channel);
    if (!adapter) throw new Error(`no adapter registered for channel ${channel}`);
    return adapter;
  }

  list(): ChannelCode[] {
    return [...this.adapters.keys()];
  }
}
