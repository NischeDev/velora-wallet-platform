const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
const suffix = Date.now();
const aliceEmail = `smoke-alice-${suffix}@example.com`;
const bobEmail = `smoke-bob-${suffix}@example.com`;
const password = 'correct-horse-battery-staple';

async function api(path, options = {}, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const body = await response.json();
  if (response.status !== expectedStatus) {
    throw new Error(
      `${options.method ?? 'GET'} ${path}: expected ${expectedStatus}, got ${response.status}: ${JSON.stringify(body)}`,
    );
  }
  return { response, body };
}

async function signup(email, fullName) {
  const { body } = await api(
    '/api/v1/auth/signup',
    { method: 'POST', body: JSON.stringify({ email, fullName, password }) },
    201,
  );
  return body.data;
}

function authenticated(token, method, body, idempotencyKey) {
  return {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
}

const alice = await signup(aliceEmail, 'Smoke Alice');
const bob = await signup(bobEmail, 'Smoke Bob');

const deposit = await api(
  '/api/v1/wallet/deposits',
  authenticated(alice.accessToken, 'POST', { amountMinor: '10000' }, 'smoke-deposit-0001'),
  201,
);
const replay = await api(
  '/api/v1/wallet/deposits',
  authenticated(alice.accessToken, 'POST', { amountMinor: '10000' }, 'smoke-deposit-0001'),
  201,
);
if (replay.response.headers.get('idempotent-replayed') !== 'true') {
  throw new Error('Duplicate deposit was not marked as replayed');
}
if (deposit.body.data.transaction.id !== replay.body.data.transaction.id) {
  throw new Error('Duplicate deposit returned a different transaction');
}

await api(
  '/api/v1/wallet/transfers',
  authenticated(
    alice.accessToken,
    'POST',
    { recipientEmail: bobEmail, amountMinor: '2500' },
    'smoke-transfer-0001',
  ),
  201,
);
await api(
  '/api/v1/wallet/withdrawals',
  authenticated(alice.accessToken, 'POST', { amountMinor: '500' }, 'smoke-withdraw-0001'),
  201,
);

const aliceWallet = await api('/api/v1/wallet', authenticated(alice.accessToken, 'GET'));
const bobWallet = await api('/api/v1/wallet', authenticated(bob.accessToken, 'GET'));
if (aliceWallet.body.data.balanceMinor !== '7000' || bobWallet.body.data.balanceMinor !== '2500') {
  throw new Error('Final balances do not match the expected ledger result');
}

const statement = await api(
  '/api/v1/wallet/transactions?page=1&pageSize=10',
  authenticated(alice.accessToken, 'GET'),
);
const analytics = await api('/api/v1/wallet/analytics', authenticated(alice.accessToken, 'GET'));
await api('/api/v1/auth/refresh', {
  method: 'POST',
  body: JSON.stringify({ refreshToken: alice.refreshToken }),
});

const carol = await signup(`smoke-carol-${suffix}@example.com`, 'Smoke Carol');
const recipientOne = `smoke-recipient-one-${suffix}@example.com`;
const recipientTwo = `smoke-recipient-two-${suffix}@example.com`;
await signup(recipientOne, 'Smoke Recipient One');
await signup(recipientTwo, 'Smoke Recipient Two');
await api(
  '/api/v1/wallet/deposits',
  authenticated(carol.accessToken, 'POST', { amountMinor: '10000' }, 'smoke-carol-deposit'),
  201,
);

const concurrentTransfers = await Promise.all(
  [recipientOne, recipientTwo].map((recipientEmail, index) => {
    const options = authenticated(
      carol.accessToken,
      'POST',
      { recipientEmail, amountMinor: '7000' },
      `smoke-carol-transfer-${index}`,
    );
    return fetch(`${baseUrl}/api/v1/wallet/transfers`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  }),
);
const concurrentStatuses = concurrentTransfers.map((response) => response.status).sort();
if (JSON.stringify(concurrentStatuses) !== JSON.stringify([201, 409])) {
  throw new Error(`Concurrent overspend protection failed: ${concurrentStatuses.join(',')}`);
}
const carolWallet = await api('/api/v1/wallet', authenticated(carol.accessToken, 'GET'));
if (carolWallet.body.data.balanceMinor !== '3000') {
  throw new Error('Concurrent transfer balance is incorrect');
}

const dave = await signup(`smoke-dave-${suffix}@example.com`, 'Smoke Dave');
const simultaneousDuplicates = await Promise.all([
  api(
    '/api/v1/wallet/deposits',
    authenticated(dave.accessToken, 'POST', { amountMinor: '1000' }, 'smoke-same-deposit'),
    201,
  ),
  api(
    '/api/v1/wallet/deposits',
    authenticated(dave.accessToken, 'POST', { amountMinor: '1000' }, 'smoke-same-deposit'),
    201,
  ),
]);
if (
  simultaneousDuplicates[0].body.data.transaction.id !==
  simultaneousDuplicates[1].body.data.transaction.id
) {
  throw new Error('Simultaneous duplicate requests created different transactions');
}
const daveWallet = await api('/api/v1/wallet', authenticated(dave.accessToken, 'GET'));
if (daveWallet.body.data.balanceMinor !== '1000') {
  throw new Error('Simultaneous duplicate requests double-credited the wallet');
}

console.log(
  JSON.stringify(
    {
      status: 'passed',
      aliceBalanceMinor: aliceWallet.body.data.balanceMinor,
      bobBalanceMinor: bobWallet.body.data.balanceMinor,
      aliceStatementCount: statement.body.data.pagination.total,
      aliceTransactionCount: analytics.body.data.transactionCount,
      idempotencyReplayVerified: true,
      concurrentOverspendProtectionVerified: true,
      simultaneousIdempotencyVerified: true,
    },
    null,
    2,
  ),
);
