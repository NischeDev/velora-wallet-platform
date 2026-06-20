import express, { type Express } from 'express';
import type { Logger } from 'pino';
import swaggerUi from 'swagger-ui-express';

import { errorHandler, notFoundHandler } from './common/middleware/error.middleware.js';
import { createRequestLogger } from './common/middleware/request-logger.middleware.js';
import {
  authRateLimit,
  createSecurityMiddleware,
  globalRateLimit,
  moneyRateLimit,
} from './common/middleware/security.middleware.js';
import type { Environment } from './config/environment.js';
import { openApiDocument } from './docs/openapi.js';
import type { CacheClient } from './infrastructure/cache/redis.js';
import type { DatabasePool } from './infrastructure/database/postgres.js';
import { AccountRepository } from './modules/accounts/account.repository.js';
import { AdminHandler } from './modules/admin/admin.handler.js';
import { createAdminMiddleware } from './modules/admin/admin.middleware.js';
import { AdminRepository } from './modules/admin/admin.repository.js';
import { createAdminRouter } from './modules/admin/admin.routes.js';
import { AdminService } from './modules/admin/admin.service.js';
import { AuthHandler } from './modules/auth/auth.handler.js';
import { createAuthMiddleware } from './modules/auth/auth.middleware.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { AuthService } from './modules/auth/auth.service.js';
import { RefreshTokenRepository } from './modules/auth/refresh-token.repository.js';
import { TokenService } from './modules/auth/token.service.js';
import { UserRepository } from './modules/auth/user.repository.js';
import { HealthHandler } from './modules/health/health.handler.js';
import { InfrastructureHealthRepository } from './modules/health/health.repository.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import { HealthService } from './modules/health/health.service.js';
import { IdempotencyRepository } from './modules/idempotency/idempotency.repository.js';
import { IdempotencyService } from './modules/idempotency/idempotency.service.js';
import { LedgerRepository } from './modules/ledger/ledger.repository.js';
import { PaymentHandler } from './modules/payments/payment.handler.js';
import {
  PaymentOrderRepository,
  ProviderWebhookRepository,
} from './modules/payments/payment-order.repository.js';
import {
  SimulatedPaymentProvider,
  type PaymentProvider,
} from './modules/payments/payment-provider.js';
import { PaymentService } from './modules/payments/payment.service.js';
import { createRazorpayClient, type RazorpayClient } from './modules/payments/razorpay.client.js';
import { RazorpayDepositHandler } from './modules/payments/razorpay-deposit.handler.js';
import { RazorpayDepositService } from './modules/payments/razorpay-deposit.service.js';
import { WalletHandler } from './modules/wallet/wallet.handler.js';
import { WalletRepository } from './modules/wallet/wallet.repository.js';
import { createWalletRouter } from './modules/wallet/wallet.routes.js';
import { WalletService } from './modules/wallet/wallet.service.js';

export interface AppDependencies {
  environment: Environment;
  logger: Logger;
  database: DatabasePool;
  cache: CacheClient;
  paymentProvider?: PaymentProvider;
  razorpayClient?: RazorpayClient | null;
}

export function createApp(dependencies: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', dependencies.environment.TRUST_PROXY);
  app.use(createRequestLogger(dependencies.logger));
  app.use(...createSecurityMiddleware(dependencies.environment));
  app.use(globalRateLimit);

  const healthRepository = new InfrastructureHealthRepository(
    dependencies.database,
    dependencies.cache,
    dependencies.logger,
  );
  const healthService = new HealthService(healthRepository);
  const healthHandler = new HealthHandler(healthService);

  const accounts = new AccountRepository(dependencies.database);
  const users = new UserRepository(dependencies.database);
  const refreshTokens = new RefreshTokenRepository();
  const tokens = new TokenService(dependencies.environment);
  const authService = new AuthService(
    dependencies.database,
    users,
    accounts,
    refreshTokens,
    tokens,
    dependencies.environment,
  );
  const authHandler = new AuthHandler(authService);
  const auth = createAuthMiddleware(tokens);
  const requireAdmin = createAdminMiddleware(users);
  const adminHandler = new AdminHandler(
    new AdminService(new AdminRepository(dependencies.database), dependencies.environment),
  );

  const idempotency = new IdempotencyService(
    dependencies.database,
    dependencies.cache,
    new IdempotencyRepository(),
    dependencies.environment,
    dependencies.logger,
  );
  const ledger = new LedgerRepository();
  const paymentService = new PaymentService(
    accounts,
    users,
    ledger,
    idempotency,
    dependencies.paymentProvider ?? new SimulatedPaymentProvider(),
    dependencies.environment,
  );
  const razorpayDepositService = new RazorpayDepositService(
    dependencies.database,
    accounts,
    ledger,
    new PaymentOrderRepository(dependencies.database),
    new ProviderWebhookRepository(dependencies.database),
    dependencies.environment,
    dependencies.razorpayClient === undefined
      ? createRazorpayClient(dependencies.environment)
      : dependencies.razorpayClient,
  );
  const razorpayDepositHandler = new RazorpayDepositHandler(razorpayDepositService);
  const walletHandler = new WalletHandler(
    new WalletService(
      accounts,
      new WalletRepository(dependencies.database),
      dependencies.environment,
    ),
  );
  const paymentHandler = new PaymentHandler(paymentService);

  app.post(
    '/api/v1/webhooks/razorpay',
    express.raw({ type: 'application/json', limit: '100kb' }),
    razorpayDepositHandler.webhook,
  );
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/v1/health', createHealthRouter(healthHandler));
  app.use('/api/v1/auth', createAuthRouter(authHandler, authRateLimit));
  app.use('/api/v1/admin', createAdminRouter({ auth, requireAdmin, handler: adminHandler }));
  app.use(
    '/api/v1/wallet',
    createWalletRouter({
      auth,
      moneyRateLimit,
      walletHandler,
      paymentHandler,
      razorpayDepositHandler,
    }),
  );
  app.get('/api-docs.json', (_request, response) => response.json(openApiDocument));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
