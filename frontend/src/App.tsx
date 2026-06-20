import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createApiClient } from './api';
import { AuthScreen } from './components/AuthScreen';
import { Dashboard } from './components/Dashboard';
import { AdminConsole } from './components/AdminConsole';
import type { Session } from './types';

const SESSION_KEY = 'velora.session';
const LEGACY_SESSION_KEY = 'ledgerpay.session';

function readSession(): Session | null {
  try {
    const value = localStorage.getItem(SESSION_KEY) ?? localStorage.getItem(LEGACY_SESSION_KEY);
    if (value && !localStorage.getItem(SESSION_KEY)) {
      localStorage.setItem(SESSION_KEY, value);
      localStorage.removeItem(LEGACY_SESSION_KEY);
    }
    return value ? (JSON.parse(value) as Session) : null;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export default function App() {
  const [session, setSessionState] = useState<Session | null>(() => readSession());
  const [surface, setSurface] = useState<'wallet' | 'admin'>('wallet');
  const hydrated = useRef(false);

  const setSession = useCallback((next: Session | null) => {
    setSessionState(next);
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LEGACY_SESSION_KEY);
    }
  }, []);

  const api = useMemo(
    () => createApiClient({ getSession: readSession, onSession: setSession }),
    [setSession],
  );

  useEffect(() => {
    if (!session || hydrated.current) return;
    hydrated.current = true;
    void api.refresh().catch(() => undefined);
  }, [api, session]);

  if (!session) {
    return (
      <AuthScreen
        signup={(input) => api.signup(input)}
        login={(input) => api.login(input)}
        onSuccess={setSession}
      />
    );
  }

  if (surface === 'admin' && session.user.role === 'ADMIN') {
    return (
      <AdminConsole
        session={session}
        request={(path, init) => api.request(path, init)}
        onBack={() => setSurface('wallet')}
        onLogout={() => api.logout()}
      />
    );
  }

  return (
    <Dashboard
      session={session}
      request={(path, init) => api.request(path, init)}
      onLogout={() => api.logout()}
      onOpenAdmin={() => setSurface('admin')}
    />
  );
}
