/**
 * The slice of KVNamespace this module needs. Declaring it locally keeps the
 * module testable with a plain Map and free of @cloudflare/workers-types at runtime.
 */
export interface KVLike {
	get(key: string): Promise<string | null>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
	list(options: { prefix: string }): Promise<{ keys: { name: string }[] }>;
	delete(key: string): Promise<void>;
}

export interface RateLimitConfig {
	/** Seconds. Also the KV expirationTtl and the Retry-After value. */
	window: number;
	limit: number;
}

export interface RateLimitResult {
	allowed: boolean;
	count: number;
	remaining: number;
	retryAfter: number;
}

/** Keys are namespaced by case id so demoing one case never eats another's quota. */
export const casePrefix = (caseId: string) => `rl:${caseId}:`;
export const phoneKey = (caseId: string, e164: string) => `${casePrefix(caseId)}phone:${e164}`;
export const ipKey = (caseId: string, ip: string) => `${casePrefix(caseId)}ip:${ip}`;

/**
 * Increment one counter and report whether the caller is still under the limit.
 *
 * ponytail: get-then-put is not atomic and KV is eventually consistent, so two
 * simultaneous requests can both read the same count and one extra request can
 * slip through. Accepted for a PoC. Upgrade path: a Durable Object per key,
 * which serialises the increment.
 */
export async function hit(
	kv: KVLike,
	key: string,
	config: RateLimitConfig
): Promise<RateLimitResult> {
	const previous = Number((await kv.get(key)) ?? 0);
	const count = previous + 1;
	// KV enforces a 60-second minimum TTL; RATE_LIMIT_WINDOW defaults to 600.
	await kv.put(key, String(count), { expirationTtl: Math.max(60, config.window) });

	return {
		allowed: count <= config.limit,
		count,
		remaining: Math.max(0, config.limit - count),
		retryAfter: config.window
	};
}

/** Deletes every counter for one case. Never touches keys outside `rl:<caseId>:`. */
export async function resetCase(kv: KVLike, caseId: string): Promise<number> {
	const { keys } = await kv.list({ prefix: casePrefix(caseId) });
	await Promise.all(keys.map((k) => kv.delete(k.name)));
	return keys.length;
}
