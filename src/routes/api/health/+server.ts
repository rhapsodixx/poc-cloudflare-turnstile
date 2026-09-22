import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ platform }) =>
	json({ ok: true, kv: Boolean(platform?.env?.RATE_LIMIT) });
