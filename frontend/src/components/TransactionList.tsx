import type { TransactionType, WalletTransaction } from '../types';
import { formatMoney } from '../money';
import { Icon } from './Icon';

interface TransactionListProps {
  transactions: WalletTransaction[];
  filter: TransactionType | 'ALL';
  page: number;
  totalPages: number;
  loading: boolean;
  onFilter: (filter: TransactionType | 'ALL') => void;
  onPage: (page: number) => void;
}

const labels: Record<TransactionType, string> = {
  DEPOSIT: 'Money added',
  TRANSFER: 'Transfer',
  WITHDRAWAL: 'Withdrawal',
};

export function TransactionList({
  transactions,
  filter,
  page,
  totalPages,
  loading,
  onFilter,
  onPage,
}: TransactionListProps) {
  return (
    <section className="panel transactions-panel">
      <div className="panel-heading transaction-heading">
        <div>
          <span className="eyebrow">Account activity</span>
          <h2>Recent transactions</h2>
        </div>
        <div className="filter-tabs" role="tablist" aria-label="Transaction type">
          {(['ALL', 'DEPOSIT', 'TRANSFER', 'WITHDRAWAL'] as const).map((type) => (
            <button
              type="button"
              key={type}
              className={filter === type ? 'active' : ''}
              onClick={() => onFilter(type)}
            >
              {type === 'ALL'
                ? 'All'
                : type === 'DEPOSIT'
                  ? 'Added'
                  : type === 'TRANSFER'
                    ? 'Sent'
                    : 'Withdrawn'}
            </button>
          ))}
        </div>
      </div>

      <div className={`transaction-list ${loading ? 'is-loading' : ''}`}>
        {transactions.length === 0 && !loading ? (
          <div className="empty-state">
            <span>
              <Icon name="refresh" size={24} />
            </span>
            <h3>No transactions yet</h3>
            <p>Your wallet activity will appear here.</p>
          </div>
        ) : (
          transactions.map((transaction) => {
            const incoming = BigInt(transaction.impactMinor) > 0n;
            return (
              <article className="transaction-row" key={transaction.id}>
                <div
                  className={`transaction-icon ${transaction.type.toLowerCase()} ${incoming ? 'incoming' : ''}`}
                >
                  <Icon
                    name={
                      transaction.type === 'DEPOSIT'
                        ? 'arrow-down'
                        : transaction.type === 'WITHDRAWAL'
                          ? 'arrow-up'
                          : 'send'
                    }
                    size={19}
                  />
                </div>
                <div className="transaction-main">
                  <strong>{labels[transaction.type]}</strong>
                  <span>
                    {transaction.counterparty && transaction.type === 'TRANSFER'
                      ? `${incoming ? 'From' : 'To'} ${transaction.counterparty}`
                      : (transaction.description ?? 'Velora wallet')}
                  </span>
                </div>
                <time dateTime={transaction.createdAt}>
                  {new Intl.DateTimeFormat('en', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  }).format(new Date(transaction.createdAt))}
                  <small>
                    {new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(
                      new Date(transaction.createdAt),
                    )}
                  </small>
                </time>
                <div className={`transaction-amount ${incoming ? 'credit' : 'debit'}`}>
                  {incoming ? '+' : '-'}
                  {formatMoney(
                    BigInt(transaction.impactMinor) < 0n
                      ? (-BigInt(transaction.impactMinor)).toString()
                      : transaction.impactMinor,
                    transaction.currency,
                  )}
                  <small>
                    {transaction.status === 'POSTED' ? 'Completed' : transaction.status}
                  </small>
                </div>
              </article>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="icon-button"
            type="button"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            aria-label="Previous page"
          >
            <Icon name="chevron-left" />
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            className="icon-button"
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
            aria-label="Next page"
          >
            <Icon name="chevron-right" />
          </button>
        </div>
      )}
    </section>
  );
}
