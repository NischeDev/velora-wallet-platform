import { useState, type FormEvent } from 'react';

import type { ApiError } from '../api';
import type { Session } from '../types';
import { Icon } from './Icon';
import { LogoMark } from './LogoMark';

interface AuthScreenProps {
  signup: (input: { email: string; fullName: string; password: string }) => Promise<Session>;
  login: (input: { email: string; password: string }) => Promise<Session>;
  onSuccess: (session: Session) => void;
}

export function AuthScreen({ signup, login, onSuccess }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const session =
        mode === 'signup'
          ? await signup({ email, fullName, password })
          : await login({ email, password });
      onSuccess(session);
    } catch (caught) {
      setError((caught as ApiError).message ?? 'Unable to continue.');
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: 'login' | 'signup') {
    setMode(next);
    setError('');
  }

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="brand brand-light">
          <LogoMark />
          <span className="brand-wordmark">velora</span>
        </div>
        <div className="story-copy">
          <span className="eyebrow">Money, made accountable</span>
          <h1>A clearer way to move your money.</h1>
          <p>
            Every deposit, transfer, and withdrawal is recorded on a balanced, immutable ledger.
            Simple for you. Serious underneath.
          </p>
          <div className="trust-row">
            <span><Icon name="shield" size={18} /> Double-entry protected</span>
            <span><Icon name="check" size={18} /> Real-time balance</span>
          </div>
        </div>
        <div className="story-orbit orbit-one" />
        <div className="story-orbit orbit-two" />
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="mobile-brand brand">
            <LogoMark />
            <span className="brand-wordmark">velora</span>
          </div>
          <div className="auth-heading">
            <span className="eyebrow">{mode === 'login' ? 'Welcome back' : 'Start your wallet'}</span>
            <h2>{mode === 'login' ? 'Sign in to continue' : 'Create your account'}</h2>
            <p>{mode === 'login' ? 'Your wallet is ready when you are.' : 'One account. One secure ledger.'}</p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Authentication method">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')} type="button">Sign in</button>
            <button className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')} type="button">Create account</button>
          </div>

          <form onSubmit={(event) => void submit(event)}>
            {mode === 'signup' && (
              <label className="field">
                <span>Full name</span>
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Alex Morgan"
                  autoComplete="name"
                  minLength={2}
                  required
                />
              </label>
            )}
            <label className="field">
              <span>Email address</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="alex@example.com"
                autoComplete="email"
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <span className="password-input">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === 'signup' ? 'At least 12 characters' : 'Enter your password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  minLength={mode === 'signup' ? 12 : 1}
                  required
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  <Icon name={showPassword ? 'eye-off' : 'eye'} size={19} />
                </button>
              </span>
            </label>

            {error && <div className="form-error" role="alert">{error}</div>}

            <button className="primary-button auth-submit" disabled={loading} type="submit">
              {loading ? <span className="spinner" /> : <>{mode === 'login' ? 'Sign in securely' : 'Create my wallet'} <Icon name="arrow-right" size={18} /></>}
            </button>
          </form>

          <p className="legal-copy">
            By continuing, you agree to responsible use of this demonstration wallet platform.
          </p>
        </div>
      </section>
    </main>
  );
}
