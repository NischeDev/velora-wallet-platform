import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ApiError } from '../api';
import { formatMoney } from '../money';
import { openRazorpayCheckout } from '../razorpay';
import type {
  Analytics,
  PaymentCapabilities,
  RazorpayDepositOrder,
  Session,
  Statement,
  TransactionType,
  Wallet,
} from '../types';
import { Icon } from './Icon';
import { LogoMark } from './LogoMark';
import { MoneyModal, type MoneyAction } from './MoneyModal';
import { TransactionList } from './TransactionList';

interface DashboardProps {
  session: Session;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  onLogout: () => Promise<void>;
  onOpenAdmin: () => void;
}

export function Dashboard({ session, request, onLogout, onOpenAdmin }: DashboardProps) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [paymentCapabilities, setPaymentCapabilities] = useState<PaymentCapabilities | null>(null);
  const [filter, setFilter] = useState<TransactionType | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<MoneyAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const fetchOverview = useCallback(async () => {
    return Promise.all([
      request<Wallet>('/api/v1/wallet'),
      request<Analytics>('/api/v1/wallet/analytics'),
      request<PaymentCapabilities>('/api/v1/wallet/payment-capabilities'),
    ]);
  }, [request]);

  const fetchStatement = useCallback(async () => {
    const query = new URLSearchParams({ page: String(page), pageSize: '8' });
    if (filter !== 'ALL') query.set('type', filter);
    return request<Statement>(`/api/v1/wallet/transactions?${query}`);
  }, [filter, page, request]);

  useEffect(() => {
    Promise.all([fetchOverview(), fetchStatement()])
      .then(([[walletData, analyticsData, capabilitiesData], statementData]) => {
        setWallet(walletData);
        setAnalytics(analyticsData);
        setPaymentCapabilities(capabilitiesData);
        setStatement(statementData);
      })
      .catch((caught: ApiError) => setError(caught.message))
      .finally(() => setLoading(false));
  }, [fetchOverview, fetchStatement]);

  const firstName = session.user.fullName.split(' ')[0] ?? session.user.fullName;
  const monthlyFlow = useMemo(() => {
    if (!analytics) return { credits: 0, debits: 0 };
    const credits = Number(BigInt(analytics.totalCreditsMinor));
    const debits = Number(BigInt(analytics.totalDebitsMinor));
    const max = Math.max(credits, debits, 1);
    return { credits: (credits / max) * 100, debits: (debits / max) * 100 };
  }, [analytics]);

  async function moneyAction(input: {
    amountMinor: string;
    description?: string;
    recipientEmail?: string;
  }) {
    if (!modal) return;
    if (modal === 'deposit' && paymentCapabilities?.checkoutEnabled) {
      await completeRazorpayDeposit(input);
    } else {
      const endpoint =
        modal === 'deposit' ? 'deposits' : modal === 'transfer' ? 'transfers' : 'withdrawals';
      await request(`/api/v1/wallet/${endpoint}`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(input),
      });
    }
    setModal(null);
    setNotice(
      modal === 'deposit'
        ? 'Money added successfully.'
        : modal === 'transfer'
          ? 'Transfer completed.'
          : 'Withdrawal completed.',
    );
    setPage(1);
    const [[walletData, analyticsData, capabilitiesData], statementData] = await Promise.all([
      fetchOverview(),
      fetchStatement(),
    ]);
    setWallet(walletData);
    setAnalytics(analyticsData);
    setPaymentCapabilities(capabilitiesData);
    setStatement(statementData);
    window.setTimeout(() => setNotice(''), 4000);
  }

  async function completeRazorpayDeposit(input: { amountMinor: string; description?: string }) {
    const order = await request<RazorpayDepositOrder>('/api/v1/wallet/deposit-orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(input),
    });
    const payment = await openRazorpayCheckout(order, session.user);
    await request('/api/v1/wallet/deposit-orders/verify', {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        localOrderId: order.localOrderId,
        razorpayOrderId: payment.razorpay_order_id,
        razorpayPaymentId: payment.razorpay_payment_id,
        razorpaySignature: payment.razorpay_signature,
      }),
    });
  }

  function changeFilter(next: TransactionType | 'ALL') {
    setFilter(next);
    setPage(1);
  }

  if (loading) {
    return (
      <div className="app-loading">
        <div className="brand">
          <LogoMark />
          <span className="brand-wordmark">velora</span>
        </div>
        <span className="spinner spinner-dark" />
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand brand-light">
          <LogoMark />
          <span className="brand-wordmark">velora</span>
        </div>
        <nav aria-label="Primary navigation">
          <button className="nav-item active">
            <Icon name="wallet" />
            Overview
          </button>
          <button
            className="nav-item"
            onClick={() =>
              document.querySelector('.transactions-panel')?.scrollIntoView({ behavior: 'smooth' })
            }
          >
            <Icon name="refresh" />
            Activity
          </button>
          {session.user.role === 'ADMIN' && (
            <button className="nav-item admin-nav-item" onClick={onOpenAdmin}>
              <Icon name="building" />
              Admin console
              <span>ADMIN</span>
            </button>
          )}
        </nav>
        <div className="sidebar-security">
          <span>
            <Icon name="shield" size={19} />
          </span>
          <div>
            <strong>Protected by Velora</strong>
            <small>Every paisa accounted for</small>
          </div>
        </div>
        <button className="nav-item logout-button" onClick={() => void onLogout()}>
          <Icon name="logout" />
          Sign out
        </button>
      </aside>

      <main className="dashboard-main">
        <header className="topbar">
          <div>
            <div className="mobile-top-brand">
              <LogoMark />
              <span className="brand-wordmark">velora</span>
            </div>
            <span className="eyebrow">Personal wallet</span>
            <h1>
              Good {dayPeriod()}, {firstName}
            </h1>
          </div>
          <div className="topbar-actions">
            <button
              className={`icon-button notification-button ${notificationsOpen ? 'active' : ''}`}
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <Icon name="bell" />
              {!!statement?.transactions.length && <span />}
            </button>
            {notificationsOpen && (
              <div className="notification-popover">
                <div className="notification-heading">
                  <div>
                    <strong>Wallet activity</strong>
                    <small>Latest posted transactions</small>
                  </div>
                  <span>{statement?.transactions.length ?? 0}</span>
                </div>
                <div className="notification-list">
                  {(statement?.transactions ?? []).slice(0, 4).map((transaction) => (
                    <button
                      key={transaction.id}
                      onClick={() => {
                        setNotificationsOpen(false);
                        document
                          .querySelector('.transactions-panel')
                          ?.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      <span className={transaction.impactMinor.startsWith('-') ? 'out' : 'in'}>
                        <Icon
                          name={transaction.impactMinor.startsWith('-') ? 'arrow-up' : 'arrow-down'}
                          size={14}
                        />
                      </span>
                      <span>
                        <strong>
                          {transaction.type === 'DEPOSIT'
                            ? 'Money added'
                            : transaction.type === 'TRANSFER'
                              ? 'Transfer posted'
                              : 'Withdrawal posted'}
                        </strong>
                        <small>
                          {transaction.description ||
                            transaction.counterparty ||
                            'Ledger transaction'}
                        </small>
                      </span>
                      <time>
                        {new Date(transaction.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </time>
                    </button>
                  ))}
                  {!statement?.transactions.length && (
                    <div className="notification-empty">You're all caught up.</div>
                  )}
                </div>
              </div>
            )}
            <div className="user-chip">
              <span>{initials(session.user.fullName)}</span>
              <div>
                <strong>{session.user.fullName}</strong>
                <small>{session.user.email}</small>
              </div>
            </div>
          </div>
        </header>

        {error && (
          <div className="page-error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="toast">
            <Icon name="check" size={18} />
            {notice}
          </div>
        )}

        <section className="overview-grid">
          <article className="balance-card">
            <div className="balance-card-top">
              <span>Available balance</span>
              <span className="currency-pill">{wallet?.currency ?? 'INR'}</span>
            </div>
            <strong>{formatMoney(wallet?.balanceMinor ?? '0', wallet?.currency ?? 'INR')}</strong>
            <small>Ledger balance · Updated just now</small>
            <div className="balance-art" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="balance-card-footer">
              <Icon name="shield" size={16} /> Secured by double-entry accounting
            </div>
          </article>

          <article className="panel quick-actions-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Move money</span>
                <h2>Quick actions</h2>
              </div>
              {paymentCapabilities?.checkoutEnabled && (
                <span className="provider-pill">Razorpay Test</span>
              )}
            </div>
            <div className="quick-actions">
              <button onClick={() => setModal('deposit')}>
                <span className="action-icon deposit">
                  <Icon name="plus" />
                </span>
                <strong>Add money</strong>
                <small>Fund wallet</small>
              </button>
              <button onClick={() => setModal('transfer')}>
                <span className="action-icon transfer">
                  <Icon name="send" />
                </span>
                <strong>Send</strong>
                <small>To a user</small>
              </button>
              <button
                onClick={() => setModal('withdraw')}
                disabled={paymentCapabilities ? !paymentCapabilities.withdrawalsEnabled : true}
                title="Test-mode payout: posts a real ledger withdrawal without sending money to a bank"
              >
                <span className="action-icon withdraw">
                  <Icon name="bank" />
                </span>
                <strong>Withdraw</strong>
                <small>Test payout</small>
              </button>
            </div>
          </article>
        </section>

        <section className="metrics-grid">
          <article className="metric-card">
            <span className="metric-icon credit">
              <Icon name="arrow-down" size={18} />
            </span>
            <div>
              <small>Total money in</small>
              <strong>
                {formatMoney(analytics?.totalCreditsMinor ?? '0', wallet?.currency ?? 'INR')}
              </strong>
            </div>
            <span className="metric-tag positive">Credits</span>
          </article>
          <article className="metric-card">
            <span className="metric-icon debit">
              <Icon name="arrow-up" size={18} />
            </span>
            <div>
              <small>Total money out</small>
              <strong>
                {formatMoney(analytics?.totalDebitsMinor ?? '0', wallet?.currency ?? 'INR')}
              </strong>
            </div>
            <span className="metric-tag">Debits</span>
          </article>
          <article className="metric-card flow-card">
            <div className="flow-heading">
              <div>
                <small>Money flow</small>
                <strong>{analytics?.transactionCount ?? 0} transactions</strong>
              </div>
              <Icon name="refresh" size={18} />
            </div>
            <div className="flow-bars">
              <span>
                <i style={{ width: `${monthlyFlow.credits}%` }} />
              </span>
              <span>
                <i style={{ width: `${monthlyFlow.debits}%` }} />
              </span>
            </div>
            <div className="flow-legend">
              <span>
                <i className="credit-dot" />
                In
              </span>
              <span>
                <i className="debit-dot" />
                Out
              </span>
            </div>
          </article>
        </section>

        <TransactionList
          transactions={statement?.transactions ?? []}
          filter={filter}
          page={page}
          totalPages={statement?.pagination.totalPages ?? 0}
          loading={false}
          onFilter={changeFilter}
          onPage={setPage}
        />

        <footer className="dashboard-footer">
          <span>Velora demonstration platform</span>
          <span>
            <Icon name="shield" size={15} /> Immutable ledger · All systems operational
          </span>
        </footer>
      </main>

      {modal && wallet && (
        <MoneyModal
          action={modal}
          balanceMinor={wallet.balanceMinor}
          currency={wallet.currency}
          onClose={() => setModal(null)}
          onSubmit={moneyAction}
        />
      )}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function dayPeriod() {
  const hour = new Date().getHours();
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
}
