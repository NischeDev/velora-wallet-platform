import { useEffect, useState, type FormEvent } from 'react';

import type { ApiError } from '../api';
import { decimalToMinorUnits, formatMoney } from '../money';
import { Icon } from './Icon';

export type MoneyAction = 'deposit' | 'transfer' | 'withdraw';

interface MoneyModalProps {
  action: MoneyAction;
  balanceMinor: string;
  currency: string;
  onClose: () => void;
  onSubmit: (input: {
    amountMinor: string;
    description?: string;
    recipientEmail?: string;
  }) => Promise<void>;
}

const actionCopy = {
  deposit: {
    title: 'Add money',
    subtitle: 'Fund your wallet instantly',
    icon: 'plus' as const,
    button: 'Add to wallet',
  },
  transfer: {
    title: 'Send money',
    subtitle: 'Transfer to another Velora user',
    icon: 'send' as const,
    button: 'Send securely',
  },
  withdraw: {
    title: 'Withdraw',
    subtitle: 'Simulate a payout and post it to the ledger — no bank transfer is made',
    icon: 'bank' as const,
    button: 'Confirm withdrawal',
  },
};

export function MoneyModal({ action, balanceMinor, currency, onClose, onSubmit }: MoneyModalProps) {
  const [amount, setAmount] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const copy = actionCopy[action];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const amountMinor = decimalToMinorUnits(amount);
      setLoading(true);
      await onSubmit({
        amountMinor,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(action === 'transfer' ? { recipientEmail: recipientEmail.trim() } : {}),
      });
    } catch (caught) {
      setError((caught as ApiError).message ?? 'Unable to complete this action.');
      setLoading(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="money-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="money-modal-title"
      >
        <button className="icon-button modal-close" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
        <div className={`action-icon ${action}`}>
          <Icon name={copy.icon} size={23} />
        </div>
        <div className="modal-heading">
          <h2 id="money-modal-title">{copy.title}</h2>
          <p>{copy.subtitle}</p>
        </div>

        <form onSubmit={(event) => void submit(event)}>
          {action === 'transfer' && (
            <label className="field">
              <span>Recipient email</span>
              <input
                type="email"
                value={recipientEmail}
                onChange={(event) => setRecipientEmail(event.target.value)}
                placeholder="friend@example.com"
                autoFocus
                required
              />
            </label>
          )}
          <label className="field">
            <span>Amount</span>
            <span className="amount-input">
              <span>{currency === 'INR' ? '₹' : '$'}</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                autoFocus={action !== 'transfer'}
                required
              />
              <small>{currency}</small>
            </span>
          </label>
          {action !== 'deposit' && (
            <div className="available-note">
              Available balance <strong>{formatMoney(balanceMinor, currency)}</strong>
            </div>
          )}
          <label className="field">
            <span>
              Description <small>Optional</small>
            </span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What's this for?"
              maxLength={200}
            />
          </label>

          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button className="primary-button modal-submit" type="submit" disabled={loading}>
            {loading ? (
              <span className="spinner" />
            ) : (
              <>
                {copy.button}
                <Icon name="arrow-right" size={18} />
              </>
            )}
          </button>
          <div className="modal-security">
            <Icon name="shield" size={15} /> Protected by an immutable double-entry ledger
          </div>
        </form>
      </section>
    </div>
  );
}
