import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('Real API Gateway Routes', () => {
  const app = createApp();

  it('GET /healthz returns 200 ok', async () => {
    const res = await request(app).get('/healthz').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('POST /auth/login returns 400 or 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'unknown@example.com', password: 'wrong' });
    expect([400, 401]).toContain(res.status);
  });

  it('GET /menu/items returns 401 when unauthorized', async () => {
    await request(app).get('/menu/items').expect(401);
  });

  it('GET /kitchen/stations returns 401 when unauthorized', async () => {
    await request(app).get('/kitchen/stations').expect(401);
  });

  it('isolates table active orders: B1 order does not leak to B2 or T-05', async () => {
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'cashier@hotelkapila.com', password: 'password123', outletId: '11111111-1111-1111-1111-111111111111' })
      .expect(200);

    const token = loginRes.body.accessToken;

    // Create order on Table B1
    const orderRes = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderType: 'DINE_IN',
        terminalNumber: 'T-01',
        diningTableId: 'tbl-07', // B1
        lines: [
          { menuItemId: 'mi-5', quantity: 1 }, // Butter Naan
          { menuItemId: 'mi-6', quantity: 1 }, // Butter Chicken Masala
        ],
      })
      .expect(201);

    expect(orderRes.body.id).toBeDefined();

    // Table B1 active order should return the created order
    const b1Res = await request(app)
      .get('/orders/by-table/B1/active')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(b1Res.body.items).toHaveLength(2);
    expect(b1Res.body.items.map((i: any) => i.menuItemId)).toContain('mi-5');
    expect(b1Res.body.items.map((i: any) => i.menuItemId)).toContain('mi-6');

    // Table B2 should return 404 (No active order)
    await request(app)
      .get('/orders/by-table/B2/active')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    // Table T-05 should return 404 (No active order)
    await request(app)
      .get('/orders/by-table/T-05/active')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
