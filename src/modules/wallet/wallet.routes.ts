import { Router, type RequestHandler } from 'express';

import type { PaymentHandler } from '../payments/payment.handler.js';
import type { RazorpayDepositHandler } from '../payments/razorpay-deposit.handler.js';
import type { WalletHandler } from './wallet.handler.js';

export function createWalletRouter(input: {
  auth: RequestHandler;
  moneyRateLimit: RequestHandler;
  walletHandler: WalletHandler;
  paymentHandler: PaymentHandler;
  razorpayDepositHandler: RazorpayDepositHandler;
}): Router {
  const router = Router();
  router.use(input.auth);
  router.get('/', input.walletHandler.getBalance);
  router.get('/transactions', input.walletHandler.getStatement);
  router.get('/analytics', input.walletHandler.getAnalytics);
  router.get('/payment-capabilities', input.razorpayDepositHandler.capabilities);
  router.post('/deposit-orders', input.moneyRateLimit, input.razorpayDepositHandler.createOrder);
  router.post('/deposit-orders/verify', input.moneyRateLimit, input.razorpayDepositHandler.verify);
  router.post('/deposits', input.moneyRateLimit, input.paymentHandler.deposit);
  router.post('/transfers', input.moneyRateLimit, input.paymentHandler.transfer);
  router.post('/withdrawals', input.moneyRateLimit, input.paymentHandler.withdraw);
  return router;
}
