export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'USER' | 'ADMIN';
  createdAt: string;
}

export interface Session {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface Wallet {
  walletId: string;
  currency: string;
  balanceMinor: string;
  cachedBalanceMinor: string;
}

export type TransactionType = 'DEPOSIT' | 'TRANSFER' | 'WITHDRAWAL';

export interface WalletTransaction {
  id: string;
  type: TransactionType;
  status: 'POSTED';
  amountMinor: string;
  impactMinor: string;
  currency: string;
  description: string | null;
  externalReference: string | null;
  counterparty: string | null;
  createdAt: string;
}

export interface Statement {
  transactions: WalletTransaction[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface Analytics {
  currency: string;
  transactionCount: number;
  totalCreditsMinor: string;
  totalDebitsMinor: string;
  depositsMinor: string;
  withdrawalsMinor: string;
  transfersReceivedMinor: string;
  transfersSentMinor: string;
  range: { from: string | null; to: string | null };
}

export interface PaymentCapabilities {
  provider: 'simulated' | 'razorpay';
  checkoutEnabled: boolean;
  withdrawalsEnabled: boolean;
  withdrawalMode: 'local-simulation';
  currency: 'USD' | 'INR';
  mode: 'local-simulation' | 'test';
}

export interface RazorpayDepositOrder {
  localOrderId: string;
  providerOrderId: string;
  keyId: string;
  amountMinor: string;
  currency: 'INR';
  brandName: string;
  description: string;
  replayed: boolean;
}

export interface RazorpayPaymentResult {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface AdminOverview {
  currency: string;
  totalUsers: number;
  adminUsers: number;
  totalWallets: number;
  totalVolumeMinor: string;
  totalDepositsMinor: string;
  totalWithdrawalsMinor: string;
  failedTransactions: number;
  pendingPaymentOrders: number;
  unbalancedTransactions: number;
  paymentSuccessRate: number | null;
  generatedAt: string;
}

export interface AdminVolumePoint {
  date: string;
  depositsMinor: string;
  transfersMinor: string;
  withdrawalsMinor: string;
  transactionCount: number;
}

export interface AdminVolume {
  currency: string;
  days: 7 | 30 | 90;
  points: AdminVolumePoint[];
}

export interface LedgerAccount {
  id: string;
  label: string;
}

export interface AdminLedgerTransaction {
  id: string;
  displayId: string;
  type: TransactionType;
  status: 'POSTED';
  amountMinor: string;
  currency: string;
  description: string | null;
  debitAccount: LedgerAccount;
  creditAccount: LedgerAccount;
  createdAt: string;
}

export interface AdminLedger {
  transactions: AdminLedgerTransaction[];
  pagination: Statement['pagination'];
}

export interface AuditEvent {
  id: string;
  displayId: string;
  type: TransactionType;
  narrative: string;
  actor: string;
  counterparty: string | null;
  amountMinor: string;
  currency: string;
  description: string | null;
  createdAt: string;
}

export interface AuditTrail {
  events: AuditEvent[];
}

export interface LedgerEntry {
  id: string;
  accountId: string;
  accountLabel: string;
  accountType: 'WALLET' | 'SYSTEM';
  entryType: 'DEBIT' | 'CREDIT';
  amountMinor: string;
  currency: string;
  createdAt: string;
}

export interface AdminTransactionDetail extends AdminLedgerTransaction {
  externalReference: string | null;
  entries: LedgerEntry[];
  balanced: boolean;
  entrySumMinor: string;
}

export interface ApiEnvelope<T> {
  success: true;
  data: T;
  meta: { requestId: string };
}

export interface ApiErrorEnvelope {
  success: false;
  error: { code: string; message: string; details?: unknown };
  meta?: { requestId: string };
}
