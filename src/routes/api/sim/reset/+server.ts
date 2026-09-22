import { json } from '@sveltejs/kit';
import { findCase } from '$lib/cases';
import { resetCase, type KVLike } from '$lib/server/ratelimit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
	const body = (await request.json().catch(() => ({}))) as { simCase?: unknown };
	// Resolving through findCase is what keeps this endpoint from deleting
	// anything outside the `rl:<known-case>:` prefix.
	const simCase = typeof body.simCase === 'string' ? findCase(body.simCase) : undefined;
	if (!simCase) return json({ ok: false, error: 'bad-request' }, { status: 400 });

	const kv = platform?.env?.RATE_LIMIT as unknown as KVLike | undefined;
	if (!kv) return json({ ok: false, error: 'kv-unavailable' }, { status: 500 });

	return json({ ok: true, deleted: await resetCase(kv, simCase.id) });
};
