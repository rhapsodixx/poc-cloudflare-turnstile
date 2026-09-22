import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { findCase } from '$lib/cases';
import { maskPhone, validatePhone } from '$lib/server/phone';
import { hit, ipKey, phoneKey, type KVLike } from '$lib/server/ratelimit';
import { checkClaims, resolveSecret, siteverify } from '$lib/server/turnstile';
import type { RequestHandler } from './$types';

const TURNSTILE_ACTION = 'request-otp';

function fail(status: number, error: string, detail?: string[]) {
	return json({ ok: false, error, detail }, { status });
}

export const POST: RequestHandler = async ({ request, platform, getClientAddress, url }) => {
	// 1. Parse and resolve the case.
	let body: { phone?: unknown; token?: unknown; simCase?: unknown };
	try {
		body = await request.json();
	} catch {
		return fail(400, 'bad-request', ['body is not valid JSON']);
	}

	const simCase = typeof body.simCase === 'string' ? findCase(body.simCase) : undefined;
	if (!simCase) return fail(400, 'bad-request', ['unknown simCase']);

	// 2. Phone, before we spend a Cloudflare call on obvious garbage.
	const phone = typeof body.phone === 'string' ? body.phone : '';
	const validated = validatePhone(phone);
	if (!validated.ok) return fail(422, 'invalid-phone', ['expected an Indonesian mobile number']);

	// 3. Token must be present.
	const token = typeof body.token === 'string' ? body.token : '';
	if (!token) return fail(400, 'missing-token');

	// 4. Verify with Cloudflare.
	const ip = getClientAddress();
	const secret = resolveSecret(simCase.secretRef, env.TURNSTILE_SECRET_KEY);
	const verification = await siteverify({ secret, token, remoteip: ip });

	if (!verification.success) {
		return fail(403, verification['error-codes']?.[0] ?? 'verification-failed', verification['error-codes']);
	}

	// Dummy secrets do not echo a trustworthy action or hostname, so only real keys are checked.
	if (simCase.secretRef === 'ENV') {
		const claim = checkClaims(verification, { action: TURNSTILE_ACTION, hostname: url.hostname });
		if (claim) return fail(403, claim, [`action=${verification.action}`, `hostname=${verification.hostname}`]);
	}

	// 5. Rate limit. Counted per verified attempt, per case, so demos stay independent.
	const kv = platform?.env?.RATE_LIMIT as unknown as KVLike | undefined;
	if (!kv) return fail(500, 'kv-unavailable', ['RATE_LIMIT binding is missing']);

	const window = Number(env.RATE_LIMIT_WINDOW ?? 600);
	const phoneLimit = Number(env.RATE_LIMIT_PER_PHONE ?? 3);
	const ipLimit = Number(env.RATE_LIMIT_PER_IP ?? 10);

	const phoneHit = await hit(kv, phoneKey(simCase.id, validated.e164), { window, limit: phoneLimit });
	const ipHit = await hit(kv, ipKey(simCase.id, ip), { window, limit: ipLimit });

	for (const [scope, result] of [
		['phone', phoneHit],
		['ip', ipHit]
	] as const) {
		if (!result.allowed) {
			return json(
				{ ok: false, error: 'rate-limited', scope, detail: [`${scope} limit reached`] },
				{ status: 429, headers: { 'Retry-After': String(result.retryAfter) } }
			);
		}
	}

	// 6. Mock send.
	console.log(`[otp] case=${simCase.id} phone=${maskPhone(validated.e164)} ip=${ip}`);

	return json({
		ok: true,
		otpId: crypto.randomUUID(),
		phone: maskPhone(validated.e164),
		expiresIn: 300,
		quota: {
			phone: { remaining: phoneHit.remaining, limit: phoneLimit },
			ip: { remaining: ipHit.remaining, limit: ipLimit }
		}
	});
};
