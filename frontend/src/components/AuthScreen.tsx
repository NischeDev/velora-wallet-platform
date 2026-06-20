import { useState, type FormEvent } from 'react';

import type { ApiError } from '../api';
import type { Session } from '../types';
import { Icon } from './Icon';
import { LogoMark } from './LogoMark';

type AuthMode = 'login' | 'signup' | 'forgot' | 'forgot-sent' | 'reset' | 'reset-complete';

interface AuthScreenProps {
  signup: (input: { email: string; fullName: string; password: string }) => Promise<Session>;
  login: (input: { email: string; password: string }) => Promise<Session>;
  forgotPassword: (email: string) => Promise<{ message: string }>;
  resetPassword: (token: string, password: string) => Promise<{ passwordReset: true }>;
  onSuccess: (session: Session) => void;
}

function readResetToken(): string | null {
  if (!window.location.hash.startsWith('#reset-password?')) return null;
  const query = window.location.hash.slice('#reset-password?'.length);
  return new URLSearchParams(query).get('token');
}

export function AuthScreen({
  signup,
  login,
  forgotPassword,
  resetPassword,
  onSuccess,
}: AuthScreenProps) {
  const [resetToken] = useState(() => readResetToken());
  const [mode, setMode] = useState<AuthMode>(() => (resetToken ? 'reset' : 'login'));
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'forgot') {
        await forgotPassword(email);
        setMode('forgot-sent');
        return;
      }

      if (mode === 'reset') {
        if (!resetToken) throw new Error('This reset link is invalid.');
        if (password !== confirmPassword) throw new Error('Passwords do not match.');
        await resetPassword(resetToken, password);
        window.history.replaceState(null, '', window.location.pathname);
        setMode('reset-complete');
        return;
      }

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

  function switchMode(next: AuthMode) {
    setMode(next);
    setError('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
  }

  const copy = getModeCopy(mode);
  const showAuthTabs = mode === 'login' || mode === 'signup';
  const showEmail = mode === 'login' || mode === 'signup' || mode === 'forgot';
  const showPasswordField = mode === 'login' || mode === 'signup' || mode === 'reset';

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
            <span>
              <Icon name="shield" size={18} /> Double-entry protected
            </span>
            <span>
              <Icon name="check" size={18} /> Real-time balance
            </span>
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
            <span className="eyebrow">{copy.eyebrow}</span>
            <h2>{copy.heading}</h2>
            <p>{copy.description}</p>
          </div>

          {showAuthTabs && (
            <div className="auth-tabs" role="tablist" aria-label="Authentication method">
              <button
                className={mode === 'login' ? 'active' : ''}
                onClick={() => switchMode('login')}
                type="button"
              >
                Sign in
              </button>
              <button
                className={mode === 'signup' ? 'active' : ''}
                onClick={() => switchMode('signup')}
                type="button"
              >
                Create account
              </button>
            </div>
          )}

          {mode === 'forgot-sent' || mode === 'reset-complete' ? (
            <div className="auth-result">
              <div className="form-success" role="status">
                <Icon name="check" size={20} />
                <span>
                  {mode === 'forgot-sent'
                    ? 'If an active account matches that email, a secure reset link will arrive shortly.'
                    : 'Your password has been changed. Every previous session has been signed out.'}
                </span>
              </div>
              <button
                className="primary-button auth-submit"
                type="button"
                onClick={() => switchMode('login')}
              >
                Return to sign in <Icon name="arrow-right" size={18} />
              </button>
            </div>
          ) : (
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

              {showEmail && (
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
              )}

              {showPasswordField && (
                <label className="field">
                  <span>
                    {mode === 'reset' ? 'New password' : 'Password'}
                    {mode === 'login' && (
                      <button
                        className="field-link"
                        type="button"
                        onClick={() => switchMode('forgot')}
                      >
                        Forgot password?
                      </button>
                    )}
                  </span>
                  <span className="password-input">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={
                        mode === 'login' ? 'Enter your password' : 'At least 12 characters'
                      }
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      minLength={mode === 'login' ? 1 : 12}
                      maxLength={72}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <Icon name={showPassword ? 'eye-off' : 'eye'} size={19} />
                    </button>
                  </span>
                </label>
              )}

              {mode === 'reset' && (
                <label className="field">
                  <span>Confirm new password</span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat your new password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={72}
                    required
                  />
                </label>
              )}

              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}

              <button className="primary-button auth-submit" disabled={loading} type="submit">
                {loading ? (
                  <span className="spinner" />
                ) : (
                  <>
                    {copy.action} <Icon name="arrow-right" size={18} />
                  </>
                )}
              </button>

              {(mode === 'forgot' || mode === 'reset') && (
                <button className="auth-back" type="button" onClick={() => switchMode('login')}>
                  Back to sign in
                </button>
              )}
            </form>
          )}

          <p className="legal-copy">
            By continuing, you agree to responsible use of this demonstration wallet platform.
          </p>
        </div>
      </section>
    </main>
  );
}

function getModeCopy(mode: AuthMode) {
  switch (mode) {
    case 'signup':
      return {
        eyebrow: 'Start your wallet',
        heading: 'Create your account',
        description: 'One account. One secure ledger.',
        action: 'Create my wallet',
      };
    case 'forgot':
      return {
        eyebrow: 'Account recovery',
        heading: 'Reset your password',
        description: 'We will send a secure, single-use link to your email.',
        action: 'Send reset link',
      };
    case 'forgot-sent':
      return {
        eyebrow: 'Check your inbox',
        heading: 'Request received',
        description: 'For your security, we never reveal whether an email is registered.',
        action: '',
      };
    case 'reset':
      return {
        eyebrow: 'Secure reset',
        heading: 'Choose a new password',
        description: 'The link expires after 15 minutes and works only once.',
        action: 'Update password',
      };
    case 'reset-complete':
      return {
        eyebrow: 'Password updated',
        heading: 'You are secure again',
        description: 'Sign in with your new password to continue.',
        action: '',
      };
    default:
      return {
        eyebrow: 'Welcome back',
        heading: 'Sign in to continue',
        description: 'Your wallet is ready when you are.',
        action: 'Sign in securely',
      };
  }
}
