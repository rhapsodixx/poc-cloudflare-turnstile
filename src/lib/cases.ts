// The single source of truth for simulation cases. Imported by the sidebar,
// the API route and the Playwright suite — so a case cannot exist without a test.
// Keep this file free of imports and side effects.

export type CaseGroup = 'Turnstile' | 'Validation' | 'Rate limit' | 'Production';

/** Which secret the server resolves for this case. Maps to TEST_SECRETS in src/lib/server/turnstile.ts. */
export type SecretRef = 'pass' | 'fail' | 'spent' | 'ENV';

export interface SimCase {
	/** Sidebar key, request body field, and Playwright test name. */
	id: string;
	group: CaseGroup;
	title: string;
	/** What the case proves. Rendered in the case card. */
	description: string;
	/** Sitekey the client renders the widget with, or 'ENV' for PUBLIC_TURNSTILE_SITEKEY. */
	sitekey: string;
	secretRef: SecretRef;
	/** Prefilled phone. Falls back to DEFAULT_PHONE. */
	phone?: string;
	/** false → the client submits without a token, to exercise the missing-token branch. */
	sendToken: boolean;
	/** Fire N requests; assert on the last one. */
	repeat?: number;
	/** Use a different valid phone on each repeat, so the per-phone limit does not trip first. */
	varyPhone?: boolean;
	expected: {
		/** Absent only when the request never leaves the browser (widgetError). */
		status?: number;
		/** Value of `error` in the response body. */
		errorCode?: string;
		/** The Turnstile widget's error-callback fires and no request is sent. */
		widgetError?: boolean;
	};
	/** Excluded from Playwright: needs a human or production keys. */
	manual?: boolean;
}

export const DEFAULT_PHONE = '081234567890';

const PASS_VISIBLE = '1x00000000000000000000AA';
const PASS_INVISIBLE = '1x00000000000000000000BB';
const FAIL_VISIBLE = '2x00000000000000000000AB';
const INTERACTIVE = '3x00000000000000000000FF';

export const cases: SimCase[] = [
	{
		id: 'pass-visible',
		group: 'Turnstile',
		title: 'Visible widget, valid token',
		description:
			'The happy path. A visible widget solves silently, the server verifies the token against a passing secret and returns a mocked OTP id with the phone masked.',
		sitekey: PASS_VISIBLE,
		secretRef: 'pass',
		sendToken: true,
		expected: { status: 200 }
	},
	{
		id: 'pass-invisible',
		group: 'Turnstile',
		title: 'Invisible widget, valid token',
		description:
			'Same outcome with no visible challenge, proving the invisible widget type is wired correctly and yields a token the server accepts.',
		sitekey: PASS_INVISIBLE,
		secretRef: 'pass',
		sendToken: true,
		expected: { status: 200 }
	},
	{
		id: 'widget-blocks',
		group: 'Turnstile',
		title: 'Widget refuses to issue a token',
		description:
			'An always-failing sitekey makes the widget fire its error-callback. The form never reaches the server — the browser is the first line of defence.',
		sitekey: FAIL_VISIBLE,
		secretRef: 'pass',
		sendToken: true,
		expected: { widgetError: true }
	},
	{
		id: 'interactive',
		group: 'Turnstile',
		title: 'Interactive challenge',
		description:
			'Forces a challenge a human must complete. Proves the flow survives a real interaction. Run this one by hand.',
		sitekey: INTERACTIVE,
		secretRef: 'pass',
		sendToken: true,
		expected: { status: 200 },
		manual: true
	},
	{
		id: 'server-rejects',
		group: 'Turnstile',
		title: 'Server rejects a token the widget accepted',
		description:
			'The widget hands over a token, but siteverify runs against an always-failing secret. Proves the server is the authority, not the client.',
		sitekey: PASS_VISIBLE,
		secretRef: 'fail',
		sendToken: true,
		expected: { status: 403, errorCode: 'invalid-input-response' }
	},
	{
		id: 'token-replay',
		group: 'Turnstile',
		title: 'Token replay',
		description:
			'Verifies against the "token already spent" secret. Proves a captured token cannot be redeemed twice.',
		sitekey: PASS_VISIBLE,
		secretRef: 'spent',
		sendToken: true,
		expected: { status: 403, errorCode: 'timeout-or-duplicate' }
	},
	{
		id: 'missing-token',
		group: 'Turnstile',
		title: 'No token at all',
		description:
			'The client submits with the token stripped, as a scripted client would. The server refuses before it ever calls siteverify.',
		sitekey: PASS_VISIBLE,
		secretRef: 'pass',
		sendToken: false,
		expected: { status: 400, errorCode: 'missing-token' }
	},
	{
		id: 'invalid-phone',
		group: 'Validation',
		title: 'Malformed phone number',
		description:
			'Phone validation runs before siteverify, so garbage input costs nothing. Proves we do not spend a Cloudflare call on an obviously bad request.',
		sitekey: PASS_VISIBLE,
		secretRef: 'pass',
		phone: '12',
		sendToken: true,
		expected: { status: 422, errorCode: 'invalid-phone' }
	},
	{
		id: 'per-phone',
		group: 'Rate limit',
		title: 'Per-phone limit',
		description:
			'Four verified requests for one number against a limit of three. The fourth is refused with a Retry-After header — one phone cannot be spammed with OTPs.',
		sitekey: PASS_VISIBLE,
		secretRef: 'pass',
		sendToken: true,
		repeat: 4,
		expected: { status: 429, errorCode: 'rate-limited' }
	},
	{
		id: 'per-ip',
		group: 'Rate limit',
		title: 'Per-IP limit',
		description:
			'Eleven verified requests from one IP, each for a different number, against a limit of ten. Proves one client cannot fan out across many victims.',
		sitekey: PASS_VISIBLE,
		secretRef: 'pass',
		sendToken: true,
		repeat: 11,
		varyPhone: true,
		expected: { status: 429, errorCode: 'rate-limited' }
	},
	{
		id: 'real-keys',
		group: 'Production',
		title: 'Real keys, real checks',
		description:
			'Uses the production sitekey and secret from the environment, and additionally requires the token to carry action "request-otp" and the deployed hostname. Needs a deployment and real keys.',
		sitekey: 'ENV',
		secretRef: 'ENV',
		sendToken: true,
		expected: { status: 200 },
		manual: true
	}
];

const GROUP_ORDER: CaseGroup[] = ['Turnstile', 'Validation', 'Rate limit', 'Production'];

export function findCase(id: string): SimCase | undefined {
	return cases.find((c) => c.id === id);
}

export function groupedCases(): { group: CaseGroup; items: SimCase[] }[] {
	return GROUP_ORDER.map((group) => ({
		group,
		items: cases.filter((c) => c.group === group)
	})).filter((g) => g.items.length > 0);
}
