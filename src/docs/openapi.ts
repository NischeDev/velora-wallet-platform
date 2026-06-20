export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Digital Wallet & Payment Platform API',
    version: '1.0.0',
    description:
      'Double-entry-ledger wallet API. All monetary amounts are integer strings in minor units.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local development' }],
  tags: [
    { name: 'Health' },
    { name: 'Auth' },
    { name: 'Wallet' },
    { name: 'Payments' },
    { name: 'Webhooks' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    parameters: {
      IdempotencyKey: {
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        schema: { type: 'string', minLength: 8, maxLength: 128 },
        description: 'Unique key for this logical money operation.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { const: false },
          error: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
      AuthRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', format: 'password' },
          fullName: { type: 'string' },
        },
      },
      MoneyRequest: {
        type: 'object',
        required: ['amountMinor'],
        properties: {
          amountMinor: { type: 'string', pattern: '^[1-9][0-9]*$', example: '2500' },
          description: { type: 'string', maxLength: 200 },
        },
      },
    },
  },
  paths: {
    '/api/v1/health/live': {
      get: {
        tags: ['Health'],
        summary: 'Process liveness',
        responses: { '200': { description: 'Alive' } },
      },
    },
    '/api/v1/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Dependency readiness',
        responses: { '200': { description: 'Ready' }, '503': { description: 'Not ready' } },
      },
    },
    '/api/v1/auth/signup': {
      post: {
        tags: ['Auth'],
        summary: 'Create a user and wallet',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { $ref: '#/components/schemas/AuthRequest' },
                  { type: 'object', required: ['fullName'] },
                ],
              },
            },
          },
        },
        responses: {
          '201': { description: 'Account created' },
          '409': { description: 'Email exists' },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Create an access and refresh token session',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthRequest' } } },
        },
        responses: {
          '200': { description: 'Authenticated' },
          '401': { description: 'Invalid credentials' },
        },
      },
    },
    '/api/v1/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate a refresh token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Token rotated' },
          '401': { description: 'Invalid token' },
        },
      },
    },
    '/api/v1/wallet': {
      get: {
        tags: ['Wallet'],
        security: [{ bearerAuth: [] }],
        summary: 'Get ledger-derived wallet balance',
        responses: { '200': { description: 'Wallet balance' } },
      },
    },
    '/api/v1/wallet/transactions': {
      get: {
        tags: ['Wallet'],
        security: [{ bearerAuth: [] }],
        summary: 'Get a paginated wallet statement',
        parameters: [
          { name: 'type', in: 'query', schema: { enum: ['DEPOSIT', 'TRANSFER', 'WITHDRAWAL'] } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
        ],
        responses: { '200': { description: 'Statement' } },
      },
    },
    '/api/v1/wallet/analytics': {
      get: {
        tags: ['Wallet'],
        security: [{ bearerAuth: [] }],
        summary: 'Aggregate wallet credits, debits, and movement types',
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
        ],
        responses: { '200': { description: 'Wallet analytics' } },
      },
    },
    '/api/v1/wallet/payment-capabilities': {
      get: {
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        summary: 'Discover the configured payment sandbox',
        responses: { '200': { description: 'Provider capability and currency' } },
      },
    },
    '/api/v1/wallet/deposit-orders': {
      post: {
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        summary: 'Create an idempotent Razorpay Test Mode order',
        parameters: [{ $ref: '#/components/parameters/IdempotencyKey' }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/MoneyRequest' } },
          },
        },
        responses: {
          '201': { description: 'Checkout order created' },
          '503': { description: 'Razorpay Test Mode is not configured' },
        },
      },
    },
    '/api/v1/wallet/deposit-orders/verify': {
      post: {
        tags: ['Payments'],
        security: [{ bearerAuth: [] }],
        summary: 'Verify a captured Razorpay payment and credit the ledger once',
        parameters: [{ $ref: '#/components/parameters/IdempotencyKey' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: [
                  'localOrderId',
                  'razorpayOrderId',
                  'razorpayPaymentId',
                  'razorpaySignature',
                ],
                properties: {
                  localOrderId: { type: 'string', format: 'uuid' },
                  razorpayOrderId: { type: 'string' },
                  razorpayPaymentId: { type: 'string' },
                  razorpaySignature: { type: 'string', minLength: 64, maxLength: 64 },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Payment verified and ledger transaction returned' },
          '409': { description: 'Payment is not captured or does not match' },
        },
      },
    },
    '/api/v1/webhooks/razorpay': {
      post: {
        tags: ['Webhooks'],
        summary: 'Receive signed, deduplicated Razorpay payment events',
        responses: {
          '200': { description: 'Event processed, ignored, or already seen' },
          '401': { description: 'Invalid webhook signature' },
        },
      },
    },
    '/api/v1/wallet/deposits': moneyPath('Deposit simulated provider funds'),
    '/api/v1/wallet/withdrawals': moneyPath('Withdraw funds through the simulated provider'),
    '/api/v1/wallet/transfers': {
      post: {
        ...moneyPath('Transfer funds to another user').post,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { $ref: '#/components/schemas/MoneyRequest' },
                  {
                    type: 'object',
                    required: ['recipientEmail'],
                    properties: { recipientEmail: { type: 'string', format: 'email' } },
                  },
                ],
              },
            },
          },
        },
      },
    },
  },
} as const;

function moneyPath(summary: string) {
  return {
    post: {
      tags: ['Payments'],
      security: [{ bearerAuth: [] }],
      summary,
      parameters: [{ $ref: '#/components/parameters/IdempotencyKey' }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/MoneyRequest' } } },
      },
      responses: {
        '201': { description: 'Posted' },
        '409': { description: 'Conflict or insufficient funds' },
      },
    },
  };
}
