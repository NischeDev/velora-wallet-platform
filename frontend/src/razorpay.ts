import type { RazorpayDepositOrder, RazorpayPaymentResult, User } from './types';

interface RazorpayCheckout {
  open(): void;
  on(
    event: 'payment.failed',
    handler: (response: { error?: { description?: string } }) => void,
  ): void;
}

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayCheckout;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let scriptPromise: Promise<void> | null = null;

export async function openRazorpayCheckout(
  order: RazorpayDepositOrder,
  user: User,
): Promise<RazorpayPaymentResult> {
  await loadCheckoutScript();
  if (!window.Razorpay) throw new Error('Razorpay Checkout could not be loaded.');

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (operation: () => void) => {
      if (settled) return;
      settled = true;
      operation();
    };
    const checkout = new window.Razorpay!({
      key: order.keyId,
      amount: order.amountMinor,
      currency: order.currency,
      name: order.brandName,
      description: order.description,
      order_id: order.providerOrderId,
      prefill: { name: user.fullName, email: user.email },
      theme: { color: '#1f4b3b' },
      retry: { enabled: true },
      handler: (result: RazorpayPaymentResult) => finish(() => resolve(result)),
      modal: {
        ondismiss: () =>
          finish(() => reject(new Error('Payment was cancelled. Your wallet was not credited.'))),
      },
    });
    checkout.on('payment.failed', (response) => {
      finish(() => reject(new Error(response.error?.description ?? 'Razorpay payment failed.')));
    });
    checkout.open();
  });
}

function loadCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Unable to load Razorpay Checkout.'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}
