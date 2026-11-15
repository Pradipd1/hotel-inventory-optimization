import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestServer, stopTestServer, clearDatabase, createHotelFixture, PASSWORDS, auth } from './helpers.js';
import { User } from '../models/index.js';

let app;
let fx;

beforeAll(async () => {
  app = await startTestServer();
});
afterAll(stopTestServer);
beforeEach(async () => {
  await clearDatabase();
  fx = await createHotelFixture(app);
});

describe('Authentication', () => {
  it('stores passwords as bcrypt hashes, never plain text', async () => {
    const stored = await User.findOne({ email: 'admin@test.com' }).select('+password').lean();
    expect(stored.password).not.toBe(PASSWORDS.admin);
    expect(stored.password).toMatch(/^\$2[aby]\$/);
  });

  it('logs in with valid credentials and returns a JWT and profile without password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'ADMIN@test.com', password: PASSWORDS.admin });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.hotel.code).toBe('TEST');
  });

  it('rejects a wrong password and an unknown email with the same message', async () => {
    const wrong = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'nope12345' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'ghost@test.com', password: 'nope12345' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('validates the login payload', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('strips NoSQL operators from the body', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(res.status).toBe(400);
  });

  it('protects routes: no token, bad token', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(auth('garbage'))).status).toBe(401);
  });

  it('returns the current user with a valid token', async () => {
    const res = await request(app).get('/api/auth/me').set(auth(fx.tokens.manager));
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('manager@test.com');
  });

  it('invalidates the token on logout', async () => {
    const out = await request(app).post('/api/auth/logout').set(auth(fx.tokens.staff));
    expect(out.status).toBe(200);
    const after = await request(app).get('/api/auth/me').set(auth(fx.tokens.staff));
    expect(after.status).toBe(401);
  });

  it('rejects deactivated users', async () => {
    await User.updateOne({ email: 'staff@test.com' }, { isActive: false });
    expect((await request(app).get('/api/auth/me').set(auth(fx.tokens.staff))).status).toBe(401);
    const login = await request(app).post('/api/auth/login').send({ email: 'staff@test.com', password: PASSWORDS.staff });
    expect(login.status).toBe(403);
  });

  it('changes password: requires the current password and issues a new token', async () => {
    const bad = await request(app)
      .put('/api/auth/password')
      .set(auth(fx.tokens.staff))
      .send({ currentPassword: 'wrong-pass1', newPassword: 'NewPass123' });
    expect(bad.status).toBe(400);

    const ok = await request(app)
      .put('/api/auth/password')
      .set(auth(fx.tokens.staff))
      .send({ currentPassword: PASSWORDS.staff, newPassword: 'NewPass123' });
    expect(ok.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth(fx.tokens.staff))).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(auth(ok.body.token))).status).toBe(200);
  });
});
