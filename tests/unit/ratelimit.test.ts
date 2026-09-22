import { beforeEach, describe, expect, test } from 'bun:test';
import {
	casePrefix,
	hit,
	ipKey,
	phoneKey,
	resetCase,
	type KVLike
} from '../../src/lib/server/ratelimit';

/** Minimal in-memory stand-in for a KV namespace. Records the TTLs it was given. */
function makeKv() {
	const store = new Map<string, string>();
	const ttls: number[] = [];
	const kv: KVLike = {
		async get(key) {
			return store.get(key) ?? null;
		},
		async put(key, value, options) {
			if (options?.expirationTtl !== undefined) ttls.push(options.expirationTtl);
			store.set(key, value);
		},
		async list({ prefix }) {
			return {
				keys: [...store.keys()]
					.filter((k) => k.startsWith(prefix))
					.map((name) => ({ name }))
			};
		},
		async delete(key) {
			store.delete(key);
		}
	};
	return { kv, store, ttls };
}

const config = { window: 600, limit: 3 };

describe('key builders', () => {
	test('namespace keys by case so demo runs do not interfere', () => {
		expect(phoneKey('per-phone', '+6281234567890')).toBe('rl:per-phone:phone:+6281234567890');
		expect(ipKey('per-ip', '1.2.3.4')).toBe('rl:per-ip:ip:1.2.3.4');
		expect(casePrefix('per-ip')).toBe('rl:per-ip:');
	});
});

describe('hit', () => {
	let kv: KVLike;
	let ttls: number[];

	beforeEach(() => {
		const made = makeKv();
		kv = made.kv;
		ttls = made.ttls;
	});

	test('allows exactly `limit` requests, then refuses', async () => {
		const key = phoneKey('per-phone', '+6281234567890');
		const results = [];
		for (let i = 0; i < 4; i++) results.push(await hit(kv, key, config));

		expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
		expect(results.map((r) => r.count)).toEqual([1, 2, 3, 4]);
		expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
	});

	test('passes the window through as the TTL and as retryAfter', async () => {
		const result = await hit(kv, phoneKey('per-phone', '+628111'), config);
		expect(ttls).toEqual([600]);
		expect(result.retryAfter).toBe(600);
	});

	test('phone and IP scopes count independently', async () => {
		const p = phoneKey('per-ip', '+628111');
		const i = ipKey('per-ip', '1.2.3.4');
		await hit(kv, p, config);
		await hit(kv, p, config);
		const ipResult = await hit(kv, i, config);
		expect(ipResult.count).toBe(1);
	});

	test('cases count independently', async () => {
		await hit(kv, phoneKey('per-phone', '+628111'), config);
		const other = await hit(kv, phoneKey('pass-visible', '+628111'), config);
		expect(other.count).toBe(1);
	});
});

describe('resetCase', () => {
	test('deletes only the keys belonging to that case', async () => {
		const { kv, store } = makeKv();
		await hit(kv, phoneKey('per-phone', '+628111'), config);
		await hit(kv, ipKey('per-phone', '1.2.3.4'), config);
		await hit(kv, phoneKey('per-ip', '+628222'), config);

		const deleted = await resetCase(kv, 'per-phone');

		expect(deleted).toBe(2);
		expect([...store.keys()]).toEqual(['rl:per-ip:phone:+628222']);
	});
});
