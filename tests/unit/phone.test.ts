import { describe, expect, test } from 'bun:test';
import { maskPhone, normalisePhone, validatePhone } from '../../src/lib/server/phone';

describe('normalisePhone', () => {
	const table: [string, string][] = [
		['081234567890', '+6281234567890'],
		['6281234567890', '+6281234567890'],
		['+6281234567890', '+6281234567890'],
		['0812 3456 7890', '+6281234567890'],
		['0812-3456-7890', '+6281234567890'],
		['+62 812-3456-7890', '+6281234567890'],
		['(0812) 3456 7890', '+6281234567890']
	];

	for (const [input, expected] of table) {
		test(`${input} -> ${expected}`, () => {
			expect(normalisePhone(input)).toBe(expected);
		});
	}
});

describe('validatePhone', () => {
	test('accepts the shortest and longest Indonesian mobile numbers', () => {
		// +628 followed by 8 digits, and +628 followed by 11 digits
		expect(validatePhone('0812345678')).toEqual({ ok: true, e164: '+62812345678' });
		expect(validatePhone('0812345678901')).toEqual({ ok: true, e164: '+62812345678901' });
	});

	test('rejects too short and too long', () => {
		expect(validatePhone('0812345678').ok).toBe(true); // 8 digits after +628 boundary check
		expect(validatePhone('12').ok).toBe(false);
		expect(validatePhone('0812').ok).toBe(false);
		expect(validatePhone('0812345678901234').ok).toBe(false);
	});

	test('rejects Indonesian landlines', () => {
		expect(validatePhone('0215551234').ok).toBe(false); // Jakarta
		expect(validatePhone('+62215551234').ok).toBe(false);
	});

	test('rejects non-Indonesian country codes', () => {
		expect(validatePhone('+6591234567').ok).toBe(false); // Singapore
		expect(validatePhone('+14155552671').ok).toBe(false); // US
	});

	test('rejects letters and empty input', () => {
		expect(validatePhone('').ok).toBe(false);
		expect(validatePhone('08tigaempat').ok).toBe(false);
	});
});

describe('maskPhone', () => {
	test('keeps the country code and prefix plus the last four digits', () => {
		expect(maskPhone('+6281234567890')).toBe('+62812***7890');
	});
});
