/** The signed-in user, as returned by `GET /v1/me`. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

/** Response body of `GET /health`. */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  checks: {database: 'ok' | 'down'};
}
