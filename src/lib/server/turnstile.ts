import type { SecretRef } from '$lib/cases';

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Cloudflare's documented dummy secrets. Public values, safe in source.
 * They only accept dummy tokens, and the real secret rejects dummy tokens,
 * so simulation cases cannot leak into each other.
 */
export const TEST_SECRETS = {
	pass: '1x0000000000000000000000000000000AA',
	fail: '2x0000000000000000000000000000000AA',
	spent: '3x0000000000000000000000000000000AA'
} as const;

export interface SiteverifyResponse {
	success: boolean;
	'error-codes'?: string[];
	action?: string;
	hostname?: string;
	challenge_ts?: string;
}

export function resolveSecret(ref: SecretRef, envSecret: string | undefined): string {
	if (ref !== 'ENV') return TEST_SECRETS[ref];
	if (!envSecret) throw new Error('TURNSTILE_SECRET_KEY is not set');
	return envSecret;
}

/**
 * Verifies a token. Retries exactly once, with the same idempotency key, when
 * Cloudflare reports `internal-error` or the request never completed — those are
 * the only two outcomes a retry can fix. A genuine rejection is returned as-is.
 */
export async function siteverify({
	secret,
	token,
	remoteip,
	fetchImpl = fetch
}: {
	secret: string;
	token: string;
	remoteip?: string;
	fetchImpl?: typeof fetch;
}): Promise<SiteverifyResponse> {
	const idempotencyKey = crypto.randomUUID();
	let last: SiteverifyResponse = { success: false, 'error-codes': ['network-error'] };

	for (let attempt = 0; attempt < 2; attempt++) {
		const body = new FormData();
		body.append('secret', secret);
		body.append('response', token);
		body.append('idempotency_key', idempotencyKey);
		if (remoteip) body.append('remoteip', remoteip);

		try {
			const response = await fetchImpl(SITEVERIFY_URL, { method: 'POST', body });
			last = (await response.json()) as SiteverifyResponse;
			if (!last['error-codes']?.includes('internal-error')) return last;
		} catch {
			last = { success: false, 'error-codes': ['network-error'] };
		}
	}

	return last;
}

/**
 * Only meaningful for real keys: a dummy secret does not echo a trustworthy
 * action or hostname. Returns the error code to surface, or null when clean.
 */
export function checkClaims(
	response: SiteverifyResponse,
	expected: { action: string; hostname: string }
): 'action-mismatch' | 'hostname-mismatch' | null {
	if (response.action !== expected.action) return 'action-mismatch';
	if (response.hostname !== expected.hostname) return 'hostname-mismatch';
	return null;
}
