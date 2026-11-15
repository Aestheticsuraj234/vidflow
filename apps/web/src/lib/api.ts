/** Small typed client for the Vidflow API. Sends the session cookie. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {'Content-Type': 'application/json', ...init.headers},
  });
  const body = (await res.json().catch(() => null)) as
    (T & {error?: {code: string; message: string}}) | null;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'unknown',
      body?.error?.message ?? `Request failed (${res.status})`,
    );
  }
  return body as T;
}
