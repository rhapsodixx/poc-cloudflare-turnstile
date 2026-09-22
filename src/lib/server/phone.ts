// Indonesia only, by design. See the spec: international numbers are out of scope.

/** +628 followed by 8-11 more digits. Mobile prefixes only; landlines (+6221, ...) fail. */
const INDONESIAN_MOBILE = /^\+628\d{8,11}$/;

/** Strips formatting and rewrites the local/national prefix to E.164. Does not validate. */
export function normalisePhone(input: string): string {
	const cleaned = input.replace(/[\s()‐-―-]/g, '');
	if (cleaned.startsWith('+62')) return cleaned;
	if (cleaned.startsWith('62')) return `+${cleaned}`;
	if (cleaned.startsWith('0')) return `+62${cleaned.slice(1)}`;
	return cleaned;
}

export type PhoneResult = { ok: true; e164: string } | { ok: false };

export function validatePhone(input: string): PhoneResult {
	const e164 = normalisePhone(input);
	return INDONESIAN_MOBILE.test(e164) ? { ok: true, e164 } : { ok: false };
}

/** +6281234567890 -> +62812***7890. Never log or return an unmasked number. */
export function maskPhone(e164: string): string {
	return `${e164.slice(0, 6)}***${e164.slice(-4)}`;
}
