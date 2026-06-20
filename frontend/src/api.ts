import type { ApiEnvelope, ApiErrorEnvelope, Session } from './types';

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const API_URL = configuredApiUrl ? configuredApiUrl.replace(/\/$/, '') : '';

export class ApiError extends Error {
  public constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

interface ApiClientOptions {
  getSession: () => Session | null;
  onSession: (session: Session | null) => void;
}

export function createApiClient(options: ApiClientOptions) {
  let refreshPromise: Promise<Session> | null = null;

  async function refreshSession(): Promise<Session> {
    const current = options.getSession();
    if (!current) throw new ApiError('Your session has expired.', 'UNAUTHENTICATED', 401);

    refreshPromise ??= request<Session>(
      '/api/v1/auth/refresh',
      {
        method: 'POST',
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      },
      false,
    ).finally(() => {
      refreshPromise = null;
    });
    const next = await refreshPromise;
    options.onSession(next);
    return next;
  }

  async function request<T>(
    path: string,
    init: RequestInit = {},
    authenticate = true,
    canRefresh = true,
  ): Promise<T> {
    const session = options.getSession();
    const headers = new Headers(init.headers);
    if (init.body) headers.set('Content-Type', 'application/json');
    if (authenticate && session) headers.set('Authorization', `Bearer ${session.accessToken}`);

    const response = await fetch(`${API_URL}${path}`, { ...init, headers });
    if (response.status === 401 && authenticate && canRefresh && session) {
      await refreshSession();
      return request<T>(path, init, authenticate, false);
    }

    const payload = (await response.json()) as ApiEnvelope<T> | ApiErrorEnvelope;
    if (!response.ok || !payload.success) {
      const error = payload as ApiErrorEnvelope;
      throw new ApiError(
        error.error?.message ?? 'Something went wrong. Please try again.',
        error.error?.code ?? 'REQUEST_FAILED',
        response.status,
      );
    }
    return payload.data;
  }

  return {
    request,
    refresh: refreshSession,
    signup(input: { email: string; fullName: string; password: string }) {
      return request<Session>(
        '/api/v1/auth/signup',
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        false,
      );
    },
    login(input: { email: string; password: string }) {
      return request<Session>(
        '/api/v1/auth/login',
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        false,
      );
    },
    async logout() {
      const current = options.getSession();
      if (current) {
        try {
          await request(
            '/api/v1/auth/logout',
            {
              method: 'POST',
              body: JSON.stringify({ refreshToken: current.refreshToken }),
            },
            false,
          );
        } finally {
          options.onSession(null);
        }
      }
    },
  };
}
