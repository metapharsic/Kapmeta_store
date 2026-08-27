import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';

// Real, Prisma-backed routers (self-contained — each owns its own
// PrismaClient and requireAuth/requirePermission wiring; no Container
// dependency). These are the actual service surface documented in
// brain/API_AND_EVENTS_CATALOG.md and brain/WIRING_GUIDE.md.
import { authRouter } from './routes/auth';
import { menuRouter } from './routes/menu';
import { kitchenRouter } from './routes/kitchen';
import { financeRouter } from './routes/finance';
import { crmRouter } from './routes/crm';
import { integrationRouter } from './routes/integration';
import { inventoryRouter } from './routes/inventory';
import { marketingRouter } from './routes/marketing';
import { notificationsRouter } from './routes/notifications';
import { publicOrderRouter } from './routes/public-order';
import { purchaseRouter } from './routes/purchase';
import { reportingRouter } from './routes/reporting';
import { userManagementRouter } from './routes/user-management';
import { waitersRouter } from './routes/waiters';
import { tablesRouter } from './routes/tables';
import { ordersRouter } from './routes/orders';

// Global BigInt JSON serialization support for Express
(BigInt.prototype as any).toJSON = function () {
  return typeof this === 'bigint' ? Number(this) : this;
};

export function createApp(): Express {
  const app = express();
  app.use(cors({
    origin: [process.env.POS_WEB_URL || 'http://localhost:4444', 'http://localhost:4445'],
    credentials: true,
  }));
  app.use(express.json());

  // --- Real service routers (top-level prefixes per API_AND_EVENTS_CATALOG.md) ---
  app.use('/auth', authRouter);
  app.use('/menu', menuRouter);
  app.use('/kitchen', kitchenRouter);
  app.use('/finance', financeRouter);
  app.use('/crm', crmRouter);
  app.use('/inventory', inventoryRouter);
  app.use('/marketing', marketingRouter);
  app.use('/reporting', reportingRouter);

  // These routers already define fully-qualified paths internally
  // (e.g. /integrations/..., /notifications, /public/..., /purchase-orders,
  // /users, /waiters/...), so they're mounted at root rather than under an
  // extra prefix.
  app.use(integrationRouter);
  app.use('/integration', integrationRouter);
  app.use('/integrations', integrationRouter);
  app.use(notificationsRouter);
  app.use(publicOrderRouter);
  app.use(purchaseRouter);
  app.use(inventoryRouter);
  app.use(userManagementRouter);
  app.use('/user-management', userManagementRouter);
  app.use(waitersRouter);
  app.use('/waiters', waitersRouter);
  app.use(tablesRouter);
  app.use(ordersRouter);

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const mapped = mapDomainError(err);
    if (mapped) {
      res.status(mapped.status).json(mapped.body);
      return;
    }
    // eslint-disable-next-line no-console
    console.error(err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: 'InternalServerError', message });
  });

  return app;
}
