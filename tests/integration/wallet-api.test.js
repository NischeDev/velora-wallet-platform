import { resolve } from 'node:path';

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { GenericContainer, Wait } from 'testcontainers';

import { createApp } from '../../dist/app.js';
import { createLogger } from '../../dist/common/logger/logger.js';
import { createCacheClient } from '../../dist/infrastructure/cache/redis.js';
import { runMigrations } from '../../dist/infrastructure/database/migration-runner.js';
import { createDatabasePool } from '../../dist/infrastructure/database/postgres.js';

describe('Digital Wallet API', () => {
  let postgres;
  let redis;
  let database;
  let cache;
  let api;
  let razorpayApi;

  beforeAll(async () => {
    [postgres, redis] = await Promise.all([
      new PostgreSqlContainer('postgres:17-alpine')
        .withDatabase('wallet_test')
        .withUsername('wallet_test')
        .withPassword('wallet_test_password')
        .start(),
      new GenericContainer('redis:7.4-alpine')
        .withCommand(['redis-server', '--appendonly', 'no', '--requirepass', 'redis_test_password'])
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
        .start(),
    ]);

    const environment = {
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: 3001,
      LOG_LEVEL: 'silent',
      TRUST_PROXY: false,
      SHUTDOWN_TIMEOUT_MS: 10_000,
      DATABASE_URL: postgres.getConnectionUri(),
      DATABASE_POOL_MAX: 10,
      DATABASE_IDLE_TIMEOUT_MS: 30_000,
      DATABASE_CONNECTION_TIMEOUT_MS: 5_000,
      DATABASE_SSL: false,
      REDIS_URL: `redis://:redis_test_password@${redis.getHost()}:${redis.getMappedPort(6379)}`,
      JWT_ACCESS_SECRET: 'test_access_secret_that_is_at_least_32_characters',
      JWT_REFRESH_SECRET: 'test_refresh_secret_that_is_at_least_32_characters',
      JWT_ACCESS_TTL_SECONDS: 900,
      JWT_REFRESH_TTL_SECONDS: 604_800,
      BCRYPT_ROUNDS: 10,
      DEFAULT_CURRENCY: 'USD',
      CORS_ORIGINS: 'http://localhost:3000',
      IDEMPOTENCY_TTL_SECONDS: 86_400,
    };
    const logger = createLogger(environment);
    database = createDatabasePool(environment, logger);
    cache = createCacheClient(environment, logger);
    await cache.connect();
    await runMigrations(database, resolve('migrations'), logger);
    api = request(createApp({ environment, logger, database, cache }));

    let latestOrder;
    const fakeRazorpayClient = {
      publicKeyId: 'rzp_test_public_key',
      async createOrder(input) {
        latestOrder = {
          id: `order_test_${Date.now()}`,
          amount: Number(input.amount),
          currency: input.currency,
          status: 'created',
        };
        return latestOrder;
      },
      verifyCheckoutSignature() {},
      async fetchPayment(paymentId) {
        return {
          id: paymentId,
          order_id: latestOrder.id,
          amount: latestOrder.amount,
          currency: latestOrder.currency,
          status: 'captured',
          captured: true,
          method: 'upi',
        };
      },
    };
    razorpayApi = request(
      createApp({
        environment: {
          ...environment,
          DEFAULT_CURRENCY: 'INR',
          PAYMENT_PROVIDER: 'razorpay',
          RAZORPAY_WEBHOOK_SECRET: 'test_webhook_secret',
        },
        logger,
        database,
        cache,
        razorpayClient: fakeRazorpayClient,
      }),
    );
  });

  afterAll(async () => {
    await Promise.allSettled([database?.end(), cache?.isOpen ? cache.quit() : Promise.resolve()]);
    await Promise.allSettled([postgres?.stop(), redis?.stop()]);
  });

  test('supports auth, idempotent deposits, transfers, withdrawals, and statements', async () => {
    const alice = await signup('alice@example.com', 'Alice Wallet');
    const bob = await signup('bob@example.com', 'Bob Wallet');

    const firstDeposit = await api
      .post('/api/v1/wallet/deposits')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .set('Idempotency-Key', 'alice-deposit-0001')
      .send({ amountMinor: '10000' })
      .expect(201);

    const replayedDeposit = await api
      .post('/api/v1/wallet/deposits')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .set('Idempotency-Key', 'alice-deposit-0001')
      .send({ amountMinor: '10000' })
      .expect(201);

    expect(replayedDeposit.headers['idempotent-replayed']).toBe('true');
    expect(replayedDeposit.body.data.transaction.id).toBe(firstDeposit.body.data.transaction.id);

    await api
      .post('/api/v1/wallet/transfers')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .set('Idempotency-Key', 'alice-transfer-0001')
      .send({ recipientEmail: 'bob@example.com', amountMinor: '2500' })
      .expect(201);

    await api
      .post('/api/v1/wallet/withdrawals')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .set('Idempotency-Key', 'alice-withdraw-0001')
      .send({ amountMinor: '500' })
      .expect(201);

    const [aliceWallet, bobWallet] = await Promise.all([
      api.get('/api/v1/wallet').set('Authorization', `Bearer ${alice.accessToken}`).expect(200),
      api.get('/api/v1/wallet').set('Authorization', `Bearer ${bob.accessToken}`).expect(200),
    ]);
    expect(aliceWallet.body.data.balanceMinor).toBe('7000');
    expect(bobWallet.body.data.balanceMinor).toBe('2500');

    const statement = await api
      .get('/api/v1/wallet/transactions?page=1&pageSize=10')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);
    expect(statement.body.data.transactions).toHaveLength(3);
    expect(statement.body.data.pagination.total).toBe(3);

    const analytics = await api
      .get('/api/v1/wallet/analytics')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);
    expect(analytics.body.data.totalCreditsMinor).toBe('10000');
    expect(analytics.body.data.totalDebitsMinor).toBe('3000');

    const rotated = await api
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: alice.refreshToken })
      .expect(200);
    expect(rotated.body.data.refreshToken).not.toBe(alice.refreshToken);
    await api.post('/api/v1/auth/refresh').send({ refreshToken: alice.refreshToken }).expect(401);

    const unbalanced = await database.query(
      `SELECT transaction_id FROM entries GROUP BY transaction_id HAVING SUM(amount) <> 0`,
    );
    expect(unbalanced.rowCount).toBe(0);

    await expect(database.query('UPDATE entries SET amount = amount + 1')).rejects.toThrow(
      /append-only/,
    );
  });

  test('serializes concurrent debits and permits only the affordable transfer', async () => {
    const carol = await signup('carol@example.com', 'Carol Wallet');
    await signup('recipient-one@example.com', 'Recipient One');
    await signup('recipient-two@example.com', 'Recipient Two');

    await api
      .post('/api/v1/wallet/deposits')
      .set('Authorization', `Bearer ${carol.accessToken}`)
      .set('Idempotency-Key', 'carol-deposit-0001')
      .send({ amountMinor: '10000' })
      .expect(201);

    const responses = await Promise.all([
      api
        .post('/api/v1/wallet/transfers')
        .set('Authorization', `Bearer ${carol.accessToken}`)
        .set('Idempotency-Key', 'carol-transfer-0001')
        .send({ recipientEmail: 'recipient-one@example.com', amountMinor: '7000' }),
      api
        .post('/api/v1/wallet/transfers')
        .set('Authorization', `Bearer ${carol.accessToken}`)
        .set('Idempotency-Key', 'carol-transfer-0002')
        .send({ recipientEmail: 'recipient-two@example.com', amountMinor: '7000' }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const wallet = await api
      .get('/api/v1/wallet')
      .set('Authorization', `Bearer ${carol.accessToken}`)
      .expect(200);
    expect(wallet.body.data.balanceMinor).toBe('3000');
  });

  test('deduplicates simultaneous requests with the same idempotency key', async () => {
    const dave = await signup('dave@example.com', 'Dave Wallet');
    const calls = await Promise.all([
      deposit(dave.accessToken, 'dave-same-deposit', '1000'),
      deposit(dave.accessToken, 'dave-same-deposit', '1000'),
    ]);
    expect(calls[0].body.data.transaction.id).toBe(calls[1].body.data.transaction.id);

    const wallet = await api
      .get('/api/v1/wallet')
      .set('Authorization', `Bearer ${dave.accessToken}`)
      .expect(200);
    expect(wallet.body.data.balanceMinor).toBe('1000');
  });

  test('credits a verified Razorpay payment exactly once', async () => {
    const signupResponse = await razorpayApi
      .post('/api/v1/auth/signup')
      .send({
        email: 'india-wallet@example.com',
        fullName: 'India Wallet',
        password: 'correct-horse-battery-staple',
      })
      .expect(201);
    const session = signupResponse.body.data;

    const firstOrder = await razorpayApi
      .post('/api/v1/wallet/deposit-orders')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('Idempotency-Key', 'india-order-0001')
      .send({ amountMinor: '5000', description: 'UPI test deposit' })
      .expect(201);

    const replayedOrder = await razorpayApi
      .post('/api/v1/wallet/deposit-orders')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('Idempotency-Key', 'india-order-0001')
      .send({ amountMinor: '5000', description: 'UPI test deposit' })
      .expect(200);
    expect(replayedOrder.body.data.providerOrderId).toBe(firstOrder.body.data.providerOrderId);

    const verification = {
      localOrderId: firstOrder.body.data.localOrderId,
      razorpayOrderId: firstOrder.body.data.providerOrderId,
      razorpayPaymentId: 'pay_test_0001',
      razorpaySignature: 'a'.repeat(64),
    };
    const firstVerification = await razorpayApi
      .post('/api/v1/wallet/deposit-orders/verify')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('Idempotency-Key', 'india-verify-0001')
      .send(verification)
      .expect(201);
    const replayedVerification = await razorpayApi
      .post('/api/v1/wallet/deposit-orders/verify')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('Idempotency-Key', 'india-verify-0002')
      .send(verification)
      .expect(201);

    expect(replayedVerification.body.data.transaction.id).toBe(
      firstVerification.body.data.transaction.id,
    );
    const wallet = await razorpayApi
      .get('/api/v1/wallet')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    expect(wallet.body.data).toMatchObject({ currency: 'INR', balanceMinor: '5000' });

    const entries = await database.query(
      'SELECT COUNT(*)::int AS count FROM entries WHERE transaction_id = $1',
      [firstVerification.body.data.transaction.id],
    );
    expect(entries.rows[0].count).toBe(2);
  });

  test('protects admin operations and exposes a balanced ledger explorer', async () => {
    const admin = await signup('operations-admin@example.com', 'Operations Admin');
    const ordinaryUser = await signup('ordinary-user@example.com', 'Ordinary User');

    await api
      .get('/api/v1/admin/overview')
      .set('Authorization', `Bearer ${ordinaryUser.accessToken}`)
      .expect(403);

    await database.query(`UPDATE users SET role = 'ADMIN' WHERE id = $1`, [admin.user.id]);

    await api
      .post('/api/v1/wallet/deposits')
      .set('Authorization', `Bearer ${ordinaryUser.accessToken}`)
      .set('Idempotency-Key', 'admin-observability-deposit')
      .send({ amountMinor: '5000', description: 'Admin observability test' })
      .expect(201);

    const overview = await api
      .get('/api/v1/admin/overview')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(overview.body.data.totalUsers).toBeGreaterThanOrEqual(2);
    expect(overview.body.data.totalWallets).toBeGreaterThanOrEqual(2);
    expect(BigInt(overview.body.data.totalVolumeMinor)).toBeGreaterThanOrEqual(5000n);

    const ledger = await api
      .get('/api/v1/admin/ledger?page=1&pageSize=25')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(ledger.body.data.transactions.length).toBeGreaterThan(0);
    expect(ledger.body.data.transactions[0]).toMatchObject({
      status: 'POSTED',
      debitAccount: expect.objectContaining({ id: expect.any(String) }),
      creditAccount: expect.objectContaining({ id: expect.any(String) }),
    });

    const transactionId = ledger.body.data.transactions[0].id;
    const detail = await api
      .get(`/api/v1/admin/transactions/${transactionId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(detail.body.data.balanced).toBe(true);
    expect(detail.body.data.entrySumMinor).toBe('0');
    expect(detail.body.data.entries).toHaveLength(2);

    const audit = await api
      .get('/api/v1/admin/audit-trail?limit=10')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(audit.body.data.events[0].narrative).toContain('deposited funds');
  });

  async function signup(email, fullName) {
    const response = await api
      .post('/api/v1/auth/signup')
      .send({ email, fullName, password: 'correct-horse-battery-staple' })
      .expect(201);
    return response.body.data;
  }

  function deposit(accessToken, idempotencyKey, amountMinor) {
    return api
      .post('/api/v1/wallet/deposits')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ amountMinor });
  }
});
