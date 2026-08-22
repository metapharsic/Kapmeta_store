import type { Customer } from './types';

export interface CrmRepository {
  findByPhoneAndOutlet(outletId: string, phone: string): Promise<Customer | null>;
  findById(id: string): Promise<Customer | null>;
  insert(customer: Customer): Promise<Customer>;
  update(customer: Customer): Promise<Customer>;
}

export class InMemoryCrmRepository implements CrmRepository {
  private byId = new Map<string, Customer>();

  async findByPhoneAndOutlet(outletId: string, phone: string): Promise<Customer | null> {
    for (const customer of this.byId.values()) {
      if (customer.outletId === outletId && customer.phone === phone) {
        return customer;
      }
    }
    return null;
  }

  async findById(id: string): Promise<Customer | null> {
    return this.byId.get(id) ?? null;
  }

  async insert(customer: Customer): Promise<Customer> {
    this.byId.set(customer.id, customer);
    return customer;
  }

  async update(customer: Customer): Promise<Customer> {
    if (!this.byId.has(customer.id)) {
      throw new Error(`Customer not found: ${customer.id}`);
    }
    this.byId.set(customer.id, customer);
    return customer;
  }
}
