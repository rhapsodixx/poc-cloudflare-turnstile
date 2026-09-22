import { describe, expect, test } from 'bun:test';
import {
	checkClaims,
	resolveSecret,
	siteverify,
	SITEVERIFY_URL,
	TEST_SECRETS
} from '../../src/lib/server/turnstile';

/** Returns a fetch stub plus the bodies it was called with. */
function stubFetch(responses: (object | Error)[]) {
	const bodies: FormData[] = [];
	const urls: string[] = [];
	const impl = (async (url: string, init: RequestInit) => {
		urls.push(String(url));
		bodies.push(init.body as FormData);
		const next = responses[bodies.length - 1] ?? responses[responses.length - 1];
		if (next instanceof Error) throw next;
		return new Response(JSON.stringify(next), {
			headers: { 'content-type': 'application/json' }
		});
	}) as unknown as typeof fetch;
	return { impl, bodies, urls };
}

describe('resolveSecret', () => {
	test('maps the case refs to the documented dummy secrets', () => {
		expect(resolveSecret('pass', undefined)).toBe(TEST_SECRETS.pass);
		expect(resolveSecret('fail', undefined)).toBe(TEST_SECRETS.fail);
		expect(resolveSecret('spent', undefined)).toBe(TEST_SECRETS.spent);
	});

	test('ENV reads the environment secret', () => {
		expect(resolveSecret('ENV', 'real-secret')).toBe('real-secret');
	});

	test('ENV with no secret configured throws rather than silently passing', () => {
		expect(() => resolveSecret('ENV', undefined)).toThrow();
	});
});

describe('siteverify', () => {
	test('posts secret, response and remoteip to the Cloudflare endpoint', async () => {
		const { impl, bodies, urls } = stubFetch([{ success: true, action: 'request-otp' }]);
		const result = await siteverify({
			secret: TEST_SECRETS.pass,
			token: 'dummy-token',
			remoteip: '1.2.3.4',
			fetchImpl: impl
		});

		expect(result.success).toBe(true);
		expect(urls[0]).toBe(SITEVERIFY_URL);
		expect(bodies[0].get('secret')).toBe(TEST_SECRETS.pass);
		expect(bodies[0].get('response')).toBe('dummy-token');
		expect(bodies[0].get('remoteip')).toBe('1.2.3.4');
		expect(String(bodies[0].get('idempotency_key')).length).toBeGreaterThan(0);
	});

	test('propagates error-codes on failure', async () => {
		const { impl } = stubFetch([{ success: false, 'error-codes': ['invalid-input-response'] }]);
		const result = await siteverify({ secret: 'x', token: 't', fetchImpl: impl });
		expect(result['error-codes']).toEqual(['invalid-input-response']);
	});

	test('retries once on internal-error, reusing the idempotency key', async () => {
		const { impl, bodies } = stubFetch([
			{ success: false, 'error-codes': ['internal-error'] },
			{ success: true }
		]);
		const result = await siteverify({ secret: 'x', token: 't', fetchImpl: impl });

		expect(result.success).toBe(true);
		expect(bodies.length).toBe(2);
		expect(bodies[0].get('idempotency_key')).toBe(bodies[1].get('idempotency_key'));
	});

	test('retries once on a network failure and reports network-error if both fail', async () => {
		const { impl, bodies } = stubFetch([new Error('boom'), new Error('boom')]);
		const result = await siteverify({ secret: 'x', token: 't', fetchImpl: impl });

		expect(bodies.length).toBe(2);
		expect(result.success).toBe(false);
		expect(result['error-codes']).toEqual(['network-error']);
	});

	test('does not retry a plain rejection', async () => {
		const { impl, bodies } = stubFetch([
			{ success: false, 'error-codes': ['timeout-or-duplicate'] },
			{ success: true }
		]);
		const result = await siteverify({ secret: 'x', token: 't', fetchImpl: impl });

		expect(bodies.length).toBe(1);
		expect(result['error-codes']).toEqual(['timeout-or-duplicate']);
	});
});

describe('checkClaims', () => {
	const expected = { action: 'request-otp', hostname: 'poc.example.com' };

	test('passes when action and hostname match', () => {
		expect(
			checkClaims({ success: true, action: 'request-otp', hostname: 'poc.example.com' }, expected)
		).toBeNull();
	});

	test('flags a mismatched action', () => {
		expect(
			checkClaims({ success: true, action: 'login', hostname: 'poc.example.com' }, expected)
		).toBe('action-mismatch');
	});

	test('flags a mismatched hostname', () => {
		expect(
			checkClaims({ success: true, action: 'request-otp', hostname: 'evil.example.com' }, expected)
		).toBe('hostname-mismatch');
	});
});
