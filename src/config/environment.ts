import 'dotenv/config';

import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');
const optionalSecret = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const connectionUrl = (name: string, protocols: readonly string[]) =>
  z.url().refine((value) => protocols.includes(new URL(value).protocol), {
    message: `${name} must use one of these protocols: ${protocols.join(', ')}`,
  });

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    TRUST_PROXY: booleanString.default(false),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    DATABASE_URL: connectionUrl('DATABASE_URL', ['postgres:', 'postgresql:']),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
    DATABASE_SSL: booleanString.default(false),
    REDIS_URL: connectionUrl('REDIS_URL', ['redis:', 'rediss:']),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(604_800),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
    DEFAULT_CURRENCY: z.enum(['USD', 'INR']).default('INR'),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
    PAYMENT_PROVIDER: z.enum(['simulated', 'razorpay']).default('simulated'),
    RAZORPAY_KEY_ID: optionalSecret,
    RAZORPAY_KEY_SECRET: optionalSecret,
    RAZORPAY_WEBHOOK_SECRET: optionalSecret,
    RAZORPAY_API_URL: z.url().default('https://api.razorpay.com/v1'),
    RAZORPAY_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(10_000),
  })
  .superRefine((value, context) => {
    if (value.PAYMENT_PROVIDER !== 'razorpay') return;
    if (!value.RAZORPAY_KEY_ID) {
      context.addIssue({
        code: 'custom',
        path: ['RAZORPAY_KEY_ID'],
        message: 'Required for Razorpay',
      });
    }
    if (!value.RAZORPAY_KEY_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['RAZORPAY_KEY_SECRET'],
        message: 'Required for Razorpay',
      });
    }
  });

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const issues = parsedEnvironment.error.issues
    .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join('\n');

  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export type Environment = z.infer<typeof environmentSchema>;

export const environment: Readonly<Environment> = Object.freeze(parsedEnvironment.data);
