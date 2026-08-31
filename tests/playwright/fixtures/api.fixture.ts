import { test as base } from "@playwright/test";
import { CustomerApiClient } from "../api/customer.api";
import { ProductApiClient } from "../api/product.api";
import { InvoiceApiClient } from "../api/invoice.api";

export interface ApiFixtures {
  api: {
    customer: CustomerApiClient;
    product: ProductApiClient;
    invoice: InvoiceApiClient;
  };
}

export const test = base.extend<ApiFixtures>({
  api: async ({ request }, use) => {
    await use({
      customer: new CustomerApiClient(request),
      product: new ProductApiClient(request),
      invoice: new InvoiceApiClient(request),
    });
  },
});

export { expect } from "@playwright/test";
