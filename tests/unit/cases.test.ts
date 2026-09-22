import { describe, expect, test } from 'bun:test';
import { cases, findCase, groupedCases, DEFAULT_PHONE } from '../../src/lib/cases';

const SITEKEYS = [
	'1x00000000000000000000AA',
	'1x00000000000000000000BB',
	'2x00000000000000000000AB',
	'3x00000000000000000000FF',
	'ENV'
];

describe('cases table', () => {
	test('ids are unique and kebab-case', () => {
		const ids = cases.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
	});

	test('covers every case named in the spec', () => {
		expect(cases.map((c) => c.id).sort()).toEqual(
			[
				'interactive',
				'invalid-phone',
				'missing-token',
				'pass-invisible',
				'pass-visible',
				'per-ip',
				'per-phone',
				'real-keys',
				'server-rejects',
				'token-replay',
				'widget-blocks'
			].sort()
		);
	});

	test('every sitekey is a documented test key or ENV', () => {
		for (const c of cases) expect(SITEKEYS).toContain(c.sitekey);
	});

	test('automatable cases declare an expected outcome the E2E suite can assert', () => {
		for (const c of cases.filter((c) => !c.manual)) {
			const hasOutcome = typeof c.expected.status === 'number' || c.expected.widgetError === true;
			expect(hasOutcome).toBe(true);
		}
	});

	test('only the Production case uses ENV', () => {
		for (const c of cases) {
			expect(c.secretRef === 'ENV').toBe(c.sitekey === 'ENV');
			if (c.secretRef === 'ENV') expect(c.group).toBe('Production');
		}
	});

	test('repeat cases repeat more than their limit implies', () => {
		expect(findCase('per-phone')?.repeat).toBe(4);
		expect(findCase('per-ip')?.repeat).toBe(11);
		expect(findCase('per-ip')?.varyPhone).toBe(true);
	});

	test('findCase returns undefined for unknown ids', () => {
		expect(findCase('does-not-exist')).toBeUndefined();
	});

	test('groupedCases preserves spec order and loses nothing', () => {
		const grouped = groupedCases();
		expect(grouped.map((g) => g.group)).toEqual([
			'Turnstile',
			'Validation',
			'Rate limit',
			'Production'
		]);
		expect(grouped.flatMap((g) => g.items).length).toBe(cases.length);
	});

	test('DEFAULT_PHONE is an Indonesian mobile number', () => {
		expect(DEFAULT_PHONE).toMatch(/^08\d{8,11}$/);
	});
});
