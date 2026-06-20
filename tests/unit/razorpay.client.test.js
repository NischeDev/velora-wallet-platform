import { createHmac } from 'node:crypto';
import { Buffer } from 'node:buffer';

import { verifyWebhookSignature } from '../../dist/modules/payments/razorpay.client.js';

describe('Razorpay signature verification', () => {
  test('accepts a valid raw-body HMAC and rejects tampering', () => {
    const secret = 'test_webhook_secret';
    const body = Buffer.from('{"event":"payment.captured"}');
    const signature = createHmac('sha256', secret).update(body).digest('hex');

    expect(() => verifyWebhookSignature(body, signature, secret)).not.toThrow();
    expect(() =>
      verifyWebhookSignature(Buffer.from('{"event":"payment.failed"}'), signature, secret),
    ).toThrow('Payment signature is invalid');
  });
});
