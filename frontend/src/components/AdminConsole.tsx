import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ApiError } from '../api';
import { formatMoney } from '../money';
import type {
  AdminLedger,
  AdminLedgerTransaction,
  AdminOverview,
  AdminTransactionDetail,
  AdminVolume,
  AuditEvent,
  AuditTrail,
  Session,
} from '../types';
import { Icon } from './Icon';
import { LogoMark } from './LogoMark';

type AdminView = 'overview' | 'ledger' | 'audit' | 'detail';

interface AdminConsoleProps {
  session: Session;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  onBack: () => void;
  onLogout: () => Promise<void>;
}

export function AdminConsole({ session, request, onBack, onLogout }: AdminConsoleProps) {
  const [view, setView] = useState<AdminView>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [volume, setVolume] = useState<AdminVolume | null>(null);
  const [ledger, setLedger] = useState<AdminLedger | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [detail, setDetail] = useState<AdminTransactionDetail | null>(null);
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadConsole = useCallback(async () => {
    const [overviewData, volumeData, ledgerData, auditData] = await Promise.all([
      request<AdminOverview>('/api/v1/admin/overview'),
      request<AdminVolume>(`/api/v1/admin/volume?days=${period}`),
      request<AdminLedger>(`/api/v1/admin/ledger?page=${page}&pageSize=25`),
      request<AuditTrail>('/api/v1/admin/audit-trail?limit=50'),
    ]);
    setOverview(overviewData);
    setVolume(volumeData);
    setLedger(ledgerData);
    setAudit(auditData.events);
  }, [page, period, request]);

  useEffect(() => {
    Promise.all([
      request<AdminOverview>('/api/v1/admin/overview'),
      request<AdminVolume>(`/api/v1/admin/volume?days=${period}`),
      request<AdminLedger>(`/api/v1/admin/ledger?page=${page}&pageSize=25`),
      request<AuditTrail>('/api/v1/admin/audit-trail?limit=50'),
    ])
      .then(([overviewData, volumeData, ledgerData, auditData]) => {
        setOverview(overviewData);
        setVolume(volumeData);
        setLedger(ledgerData);
        setAudit(auditData.events);
      })
      .catch((caught: ApiError) => setError(caught.message))
      .finally(() => setLoading(false));
  }, [page, period, request]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== '/' || view !== 'ledger' || event.target instanceof HTMLInputElement)
        return;
      event.preventDefault();
      document.querySelector<HTMLInputElement>('#ops-ledger-search')?.focus();
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, [view]);

  const filteredLedger = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return ledger?.transactions ?? [];
    return (ledger?.transactions ?? []).filter((transaction) =>
      [
        transaction.displayId,
        transaction.type,
        transaction.debitAccount.label,
        transaction.creditAccount.label,
      ].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [ledger, query]);

  async function refresh() {
    setRefreshing(true);
    setError('');
    try {
      await loadConsole();
    } catch (caught) {
      setError((caught as ApiError).message);
    } finally {
      setRefreshing(false);
    }
  }

  async function openTransaction(transactionId: string) {
    setError('');
    try {
      setDetail(
        await request<AdminTransactionDetail>(`/api/v1/admin/transactions/${transactionId}`),
      );
      setView('detail');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (caught) {
      setError((caught as ApiError).message);
    }
  }

  function navigate(next: Exclude<AdminView, 'detail'>) {
    setView(next);
    setDetail(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (loading) {
    return (
      <div className="ops-loading">
        <LogoMark className="ops-logo" />
        <strong>Loading operations console</strong>
        <span className="spinner spinner-dark" />
      </div>
    );
  }

  return (
    <div className="ops-shell">
      <aside className="ops-sidebar">
        <div className="ops-brand">
          <LogoMark />
          <div>
            <strong>Velora</strong>
            <small>Operations</small>
          </div>
        </div>
        <div className="ops-environment">
          <i /> Test environment
        </div>
        <nav aria-label="Admin navigation">
          <button
            className={view === 'overview' ? 'active' : ''}
            onClick={() => navigate('overview')}
          >
            <Icon name="building" /> Platform overview
          </button>
          <button
            className={view === 'ledger' || view === 'detail' ? 'active' : ''}
            onClick={() => navigate('ledger')}
          >
            <Icon name="timeline" /> Ledger explorer
          </button>
          <button className={view === 'audit' ? 'active' : ''} onClick={() => navigate('audit')}>
            <Icon name="shield" /> Audit trail
          </button>
        </nav>
        <div className="ops-sidebar-footer">
          <button onClick={onBack}>
            <Icon name="wallet" /> Customer wallet
          </button>
          <button onClick={() => void onLogout()}>
            <Icon name="logout" /> Sign out
          </button>
        </div>
      </aside>

      <main className="ops-main">
        <header className="ops-topbar">
          <div>
            <span className="ops-kicker">
              Admin / {view === 'detail' ? 'Ledger explorer' : titleFor(view)}
            </span>
            <h1>{view === 'detail' ? detail?.displayId : titleFor(view)}</h1>
          </div>
          <div className="ops-topbar-actions">
            <button className="ops-refresh" onClick={() => void refresh()} disabled={refreshing}>
              <Icon name="refresh" size={16} /> {refreshing ? 'Refreshing' : 'Refresh data'}
            </button>
            <div className="ops-admin-chip">
              <span>{initials(session.user.fullName)}</span>
              <div>
                <strong>{session.user.fullName}</strong>
                <small>Administrator</small>
              </div>
            </div>
          </div>
        </header>

        {error && (
          <div className="ops-error" role="alert">
            {error}
          </div>
        )}

        {view === 'overview' && overview && (
          <Overview
            data={overview}
            volume={volume}
            period={period}
            ledger={ledger?.transactions.slice(0, 6) ?? []}
            audit={audit.slice(0, 5)}
            onOpenTransaction={(id) => void openTransaction(id)}
            onOpenLedger={() => navigate('ledger')}
            onOpenAudit={() => navigate('audit')}
            onPeriod={setPeriod}
          />
        )}

        {view === 'ledger' && (
          <LedgerExplorer
            ledger={ledger}
            transactions={filteredLedger}
            query={query}
            page={page}
            onQuery={setQuery}
            onPage={setPage}
            onOpen={(id) => void openTransaction(id)}
          />
        )}

        {view === 'audit' && (
          <AuditTrailView events={audit} onOpen={(id) => void openTransaction(id)} />
        )}

        {view === 'detail' && detail && (
          <TransactionDetail detail={detail} onBack={() => navigate('ledger')} />
        )}
      </main>
    </div>
  );
}

function Overview(props: {
  data: AdminOverview;
  volume: AdminVolume | null;
  period: 7 | 30 | 90;
  ledger: AdminLedgerTransaction[];
  audit: AuditEvent[];
  onOpenTransaction: (id: string) => void;
  onOpenLedger: () => void;
  onOpenAudit: () => void;
  onPeriod: (period: 7 | 30 | 90) => void;
}) {
  const metrics = [
    {
      label: 'Total users',
      value: props.data.totalUsers.toLocaleString('en-IN'),
      hint: `${props.data.totalUsers - props.data.adminUsers} customers · ${props.data.adminUsers} admin`,
      tone: 'blue',
    },
    {
      label: 'Total wallets',
      value: props.data.totalWallets.toLocaleString('en-IN'),
      hint: `${props.data.currency} customer accounts`,
      tone: 'violet',
    },
    {
      label: 'Total volume',
      value: formatMoney(props.data.totalVolumeMinor, props.data.currency),
      hint: 'Posted ledger volume',
      tone: 'green',
    },
    {
      label: 'Total deposits',
      value: formatMoney(props.data.totalDepositsMinor, props.data.currency),
      hint: 'Funds credited',
      tone: 'teal',
    },
    {
      label: 'Total withdrawals',
      value: formatMoney(props.data.totalWithdrawalsMinor, props.data.currency),
      hint: 'Funds paid out',
      tone: 'amber',
    },
    {
      label: 'Failed transactions',
      value: props.data.failedTransactions.toLocaleString('en-IN'),
      hint: 'Provider failures',
      tone: props.data.failedTransactions ? 'red' : 'slate',
    },
  ];
  return (
    <>
      <section className="ops-metrics">
        {metrics.map((metric) => (
          <article key={metric.label} className={`ops-metric ${metric.tone}`}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.hint}</small>
          </article>
        ))}
      </section>
      <section className="ops-analytics-grid">
        <article className="ops-panel ops-volume-panel">
          <div className="ops-panel-title">
            <div>
              <span className="ops-kicker">Payment analytics</span>
              <h2>Money movement</h2>
            </div>
            <div className="ops-period-tabs">
              {([7, 30, 90] as const).map((days) => (
                <button
                  key={days}
                  className={props.period === days ? 'active' : ''}
                  onClick={() => props.onPeriod(days)}
                >
                  {days}D
                </button>
              ))}
            </div>
          </div>
          <VolumeChart volume={props.volume} />
        </article>
        <article className="ops-panel ops-signals-panel">
          <PanelTitle eyebrow="Risk & reconciliation" title="Operational signals" />
          <div className="ops-signals">
            <div>
              <span>
                <i className="good" /> Payment success rate
              </span>
              <strong>
                {props.data.paymentSuccessRate === null ? '—' : `${props.data.paymentSuccessRate}%`}
              </strong>
            </div>
            <div>
              <span>
                <i className={props.data.pendingPaymentOrders ? 'warn' : 'good'} /> Pending payment
                orders
              </span>
              <strong>{props.data.pendingPaymentOrders}</strong>
            </div>
            <div>
              <span>
                <i className={props.data.unbalancedTransactions ? 'bad' : 'good'} /> Unbalanced
                postings
              </span>
              <strong>{props.data.unbalancedTransactions}</strong>
            </div>
          </div>
        </article>
      </section>
      <section className="ops-overview-grid">
        <article className="ops-panel ops-ledger-panel">
          <PanelTitle
            eyebrow="Live ledger"
            title="Latest postings"
            action="Explore ledger"
            onAction={props.onOpenLedger}
          />
          <LedgerTable transactions={props.ledger} onOpen={props.onOpenTransaction} compact />
        </article>
        <article className="ops-panel ops-audit-panel">
          <PanelTitle
            eyebrow="Control plane"
            title="Recent audit trail"
            action="View trail"
            onAction={props.onOpenAudit}
          />
          <AuditList events={props.audit} onOpen={props.onOpenTransaction} />
        </article>
      </section>
      <div className="ops-integrity-strip">
        <span>
          <Icon name="shield" size={17} /> Ledger integrity monitor
        </span>
        <strong className={props.data.unbalancedTransactions ? 'integrity-alert' : ''}>
          <i />{' '}
          {props.data.unbalancedTransactions
            ? `${props.data.unbalancedTransactions} integrity exception(s)`
            : 'All posted transactions balanced'}
        </strong>
        <small>
          Checked{' '}
          {new Date(props.data.generatedAt).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </small>
      </div>
    </>
  );
}

function VolumeChart({ volume }: { volume: AdminVolume | null }) {
  const points = volume?.points ?? [];
  const totals = points.map(
    (point) =>
      BigInt(point.depositsMinor) + BigInt(point.transfersMinor) + BigInt(point.withdrawalsMinor),
  );
  const maximum = totals.reduce((max, value) => (value > max ? value : max), 1n);
  const totalVolume = totals.reduce((total, value) => total + value, 0n);

  return (
    <div className="ops-volume-chart">
      <div className="ops-chart-summary">
        <div>
          <small>Period volume</small>
          <strong>{formatMoney(totalVolume.toString(), volume?.currency ?? 'INR')}</strong>
        </div>
        <div className="ops-chart-legend">
          <span>
            <i className="deposit" /> Deposits
          </span>
          <span>
            <i className="transfer" /> Transfers
          </span>
          <span>
            <i className="withdrawal" /> Withdrawals
          </span>
        </div>
      </div>
      <div className="ops-bars" aria-label={`${volume?.days ?? 30} day transaction volume`}>
        {points.map((point, index) => {
          const deposit = BigInt(point.depositsMinor);
          const transfer = BigInt(point.transfersMinor);
          const withdrawal = BigInt(point.withdrawalsMinor);
          const height = (value: bigint) => `${Number((value * 100n) / maximum)}%`;
          return (
            <div
              className="ops-bar-day"
              key={point.date}
              title={`${point.date}: ${point.transactionCount} transactions`}
            >
              <span className="ops-bar-stack">
                <i className="deposit" style={{ height: height(deposit) }} />
                <i className="transfer" style={{ height: height(transfer) }} />
                <i className="withdrawal" style={{ height: height(withdrawal) }} />
              </span>
              {(index === 0 ||
                index === points.length - 1 ||
                (points.length <= 7 && index > 0)) && (
                <small>
                  {new Date(`${point.date}T00:00:00`).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                  })}
                </small>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LedgerExplorer(props: {
  ledger: AdminLedger | null;
  transactions: AdminLedgerTransaction[];
  query: string;
  page: number;
  onQuery: (value: string) => void;
  onPage: (page: number) => void;
  onOpen: (id: string) => void;
}) {
  function exportCsv() {
    const header = [
      'Transaction ID',
      'Type',
      'Debit Account',
      'Credit Account',
      'Amount Minor',
      'Currency',
      'Status',
      'Created At',
    ];
    const rows = props.transactions.map((transaction) => [
      transaction.displayId,
      transaction.type,
      transaction.debitAccount.label,
      transaction.creditAccount.label,
      transaction.amountMinor,
      transaction.currency,
      transaction.status,
      transaction.createdAt,
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `velora-ledger-page-${props.page}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="ops-panel ops-ledger-full">
      <div className="ops-toolbar">
        <div>
          <span className="ops-kicker">Source of truth</span>
          <h2>Double-entry ledger</h2>
        </div>
        <div className="ops-toolbar-actions">
          <label className="ops-search">
            <Icon name="search" size={16} />
            <input
              id="ops-ledger-search"
              value={props.query}
              onChange={(event) => props.onQuery(event.target.value)}
              placeholder="Search transaction or account"
            />
            <kbd>/</kbd>
          </label>
          <button className="ops-export" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      </div>
      <LedgerTable transactions={props.transactions} onOpen={props.onOpen} />
      <div className="ops-pagination">
        <span>{props.ledger?.pagination.total ?? 0} transactions</span>
        <div>
          <button disabled={props.page <= 1} onClick={() => props.onPage(props.page - 1)}>
            <Icon name="chevron-left" size={16} />
          </button>
          <strong>
            Page {props.page} of {Math.max(props.ledger?.pagination.totalPages ?? 1, 1)}
          </strong>
          <button
            disabled={props.page >= (props.ledger?.pagination.totalPages ?? 0)}
            onClick={() => props.onPage(props.page + 1)}
          >
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

function LedgerTable({
  transactions,
  onOpen,
  compact = false,
}: {
  transactions: AdminLedgerTransaction[];
  onOpen: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div className="ops-table-wrap">
      <table className={`ops-table ${compact ? 'compact' : ''}`}>
        <thead>
          <tr>
            <th>Transaction ID</th>
            <th>Debit account</th>
            <th>Credit account</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Created at</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.id}>
              <td>
                <button className="ops-txn-link" onClick={() => onOpen(transaction.id)}>
                  {transaction.displayId}
                </button>
                <small>{transaction.type}</small>
              </td>
              <td>
                <AccountCell
                  label={transaction.debitAccount.label}
                  id={transaction.debitAccount.id}
                />
              </td>
              <td>
                <AccountCell
                  label={transaction.creditAccount.label}
                  id={transaction.creditAccount.id}
                />
              </td>
              <td className="ops-money">
                {formatMoney(transaction.amountMinor, transaction.currency)}
              </td>
              <td>
                <span className="ops-status">
                  <i /> Posted
                </span>
              </td>
              <td className="ops-date">{formatDateTime(transaction.createdAt)}</td>
            </tr>
          ))}
          {!transactions.length && (
            <tr>
              <td colSpan={6} className="ops-empty">
                No ledger transactions match this view.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AuditTrailView({
  events,
  onOpen,
}: {
  events: AuditEvent[];
  onOpen: (id: string) => void;
}) {
  return (
    <section className="ops-panel ops-audit-full">
      <div className="ops-toolbar">
        <div>
          <span className="ops-kicker">Immutable activity</span>
          <h2>Platform audit trail</h2>
          <p>Human-readable events derived directly from posted ledger transactions.</p>
        </div>
      </div>
      <AuditList events={events} onOpen={onOpen} expanded />
    </section>
  );
}

function AuditList({
  events,
  onOpen,
  expanded = false,
}: {
  events: AuditEvent[];
  onOpen: (id: string) => void;
  expanded?: boolean;
}) {
  return (
    <div className={`ops-audit-list ${expanded ? 'expanded' : ''}`}>
      {events.map((event) => (
        <button key={event.id} className="ops-audit-event" onClick={() => onOpen(event.id)}>
          <span className={`ops-event-icon ${event.type.toLowerCase()}`}>
            <Icon
              name={
                event.type === 'TRANSFER'
                  ? 'send'
                  : event.type === 'DEPOSIT'
                    ? 'arrow-down'
                    : 'arrow-up'
              }
              size={16}
            />
          </span>
          <span className="ops-event-copy">
            <strong>{event.narrative}</strong>
            <small>{event.description || event.displayId}</small>
          </span>
          <span className="ops-event-meta">
            <strong>{formatMoney(event.amountMinor, event.currency)}</strong>
            <small>{formatDateTime(event.createdAt)}</small>
          </span>
          <Icon name="chevron-right" size={15} />
        </button>
      ))}
      {!events.length && <div className="ops-empty">No posted activity yet.</div>}
    </div>
  );
}

function TransactionDetail({
  detail,
  onBack,
}: {
  detail: AdminTransactionDetail;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copyId() {
    await navigator.clipboard.writeText(detail.id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="ops-detail-page">
      <button className="ops-back" onClick={onBack}>
        <Icon name="chevron-left" size={16} /> Back to ledger
      </button>
      <section className="ops-detail-hero">
        <div>
          <span className="ops-kicker">Posted transaction</span>
          <h2>{detail.displayId}</h2>
          <p>{detail.description || `${detail.type.toLowerCase()} transaction`}</p>
        </div>
        <div className="ops-detail-amount">
          <span>{detail.type}</span>
          <strong>{formatMoney(detail.amountMinor, detail.currency)}</strong>
          <small>{formatDateTime(detail.createdAt)}</small>
        </div>
      </section>
      <section className="ops-detail-grid">
        <article className="ops-panel ops-entries-card">
          <PanelTitle eyebrow="Journal" title="Ledger entries" />
          <div className="ops-entries">
            {detail.entries.map((entry) => (
              <div key={entry.id} className={entry.entryType.toLowerCase()}>
                <span>
                  <strong>{entry.accountLabel}</strong>
                  <small>
                    {entry.accountType} · {entry.entryType}
                  </small>
                </span>
                <strong>{signedMoney(entry.amountMinor, entry.currency)}</strong>
              </div>
            ))}
          </div>
          <div className={`ops-balance-check ${detail.balanced ? 'yes' : 'no'}`}>
            <span>
              <Icon name={detail.balanced ? 'check' : 'close'} size={18} /> Balanced
            </span>
            <strong>{detail.balanced ? 'YES' : 'NO'}</strong>
            <small>Entry sum: {formatMoney(detail.entrySumMinor, detail.currency)}</small>
          </div>
        </article>
        <aside className="ops-panel ops-metadata-card">
          <PanelTitle eyebrow="Metadata" title="Transaction record" />
          <dl>
            <div>
              <dt>Status</dt>
              <dd>
                <span className="ops-status">
                  <i /> Posted
                </span>
              </dd>
            </div>
            <div>
              <dt>Transaction UUID</dt>
              <dd className="ops-uuid">
                {detail.id}
                <button onClick={() => void copyId()} title="Copy transaction ID">
                  <Icon name={copied ? 'check' : 'copy'} size={14} />
                </button>
              </dd>
            </div>
            <div>
              <dt>External reference</dt>
              <dd>{detail.externalReference || '—'}</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>{detail.currency}</dd>
            </div>
            <div>
              <dt>Created at</dt>
              <dd>{formatDateTime(detail.createdAt)}</dd>
            </div>
          </dl>
        </aside>
      </section>
    </div>
  );
}

function PanelTitle({
  eyebrow,
  title,
  action,
  onAction,
}: {
  eyebrow: string;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="ops-panel-title">
      <div>
        <span className="ops-kicker">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {action && onAction && (
        <button onClick={onAction}>
          {action}
          <Icon name="arrow-right" size={15} />
        </button>
      )}
    </div>
  );
}

function AccountCell({ label, id }: { label: string; id: string }) {
  return (
    <span className="ops-account">
      <strong>{label}</strong>
      <small>
        {id.slice(0, 8)}…{id.slice(-4)}
      </small>
    </span>
  );
}

function signedMoney(amountMinor: string, currency: string) {
  const amount = BigInt(amountMinor);
  return `${amount > 0n ? '+' : ''}${formatMoney(amountMinor, currency)}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function titleFor(view: Exclude<AdminView, 'detail'>) {
  return view === 'overview'
    ? 'Platform overview'
    : view === 'ledger'
      ? 'Ledger explorer'
      : 'Audit trail';
}

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}
