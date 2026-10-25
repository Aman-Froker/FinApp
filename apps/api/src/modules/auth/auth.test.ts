import request from 'supertest';
import { describe, expect, test } from 'vitest';

import { createApp } from '../../app.js';

const app = createApp();
const creds = { email: 'Aman@Example.com', password: 'correct horse battery' };

describe('auth', () => {
  test('signs up, normalises the email and returns tokens', async () => {
    const res = await request(app).post('/v1/auth/sign-up').send(creds);
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('aman@example.com');
    expect(res.body.tokens.accessToken).toBeTruthy();
    expect(res.body.tokens.refreshToken).toBeTruthy();
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  test('rejects a weak password with the standard error shape', async () => {
    const res = await request(app).post('/v1/auth/sign-up').send({ email: creds.email, password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
    expect(res.body.error.details[0].path).toBe('body.password');
  });

  test('refuses a duplicate email', async () => {
    await request(app).post('/v1/auth/sign-up').send(creds);
    const res = await request(app).post('/v1/auth/sign-up').send(creds);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('email_taken');
  });

  test('signs in, serves /v1/me, and rejects a wrong password', async () => {
    await request(app).post('/v1/auth/sign-up').send(creds);
    const ok = await request(app).post('/v1/auth/sign-in').send(creds);
    expect(ok.status).toBe(200);
    const me = await request(app).get('/v1/me').set('Authorization', `Bearer ${ok.body.tokens.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('aman@example.com');

    const bad = await request(app).post('/v1/auth/sign-in').send({ ...creds, password: 'wrong password!' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('invalid_credentials');
  });

  test('rotates refresh tokens and revokes the family on reuse', async () => {
    const { body } = await request(app).post('/v1/auth/sign-up').send(creds);
    const first = body.tokens.refreshToken;

    const rotated = await request(app).post('/v1/auth/refresh').send({ refreshToken: first });
    expect(rotated.status).toBe(200);
    const second = rotated.body.tokens.refreshToken;
    expect(second).not.toBe(first);

    // Replaying the old token is treated as theft: the whole session dies.
    const reuse = await request(app).post('/v1/auth/refresh').send({ refreshToken: first });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('refresh_token_reused');

    const afterReuse = await request(app).post('/v1/auth/refresh').send({ refreshToken: second });
    expect(afterReuse.status).toBe(401);
  });

  test('sign-out revokes the session', async () => {
    const { body } = await request(app).post('/v1/auth/sign-up').send(creds);
    const out = await request(app).post('/v1/auth/sign-out').send({ refreshToken: body.tokens.refreshToken });
    expect(out.status).toBe(204);
    const res = await request(app).post('/v1/auth/refresh').send({ refreshToken: body.tokens.refreshToken });
    expect(res.status).toBe(401);
  });

  test('protects /v1/me and reports health', async () => {
    expect((await request(app).get('/v1/me')).status).toBe(401);
    expect((await request(app).get('/health')).body).toEqual({ status: 'ok' });
    expect((await request(app).get('/ready')).status).toBe(200);
    expect((await request(app).get('/nope')).status).toBe(404);
  });
});
