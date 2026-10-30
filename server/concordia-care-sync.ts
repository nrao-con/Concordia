/**
 * Shared configuration and failure classification for outbound ConcordiaCare
 * requests. Keep the preferred secret name in one place so initial sends and
 * outbox retries cannot drift onto different credentials.
 */
export function getConcordiaCareApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.CONCORDIA_RX_API_KEY || env.API_KEY || undefined;
}

export function isPermanentConcordiaCareAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}