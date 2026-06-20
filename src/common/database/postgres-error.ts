export interface PostgresError extends Error {
  code?: string;
  constraint?: string;
}

export function isPostgresError(error: unknown, code?: string): error is PostgresError {
  if (!(error instanceof Error) || !('code' in error)) return false;
  return code === undefined || (error as PostgresError).code === code;
}
