import { expect, test, type Page } from '@playwright/test';
import { cases, DEFAULT_PHONE } from '../../src/lib/cases';

/** Clears this case's rate-limit counters so repeated local runs start clean. */
async function resetCase(page: Page, id: string) {
	const response = await page.request.post('/api/sim/reset', { data: { simCase: id } });
	expect(response.status()).toBe(200);
}

/**
 * Deterministic hydration signal for the form's submit handler.
 *
 * Svelte 5's `onsubmit={submit}` attribute does NOT set the DOM `.onsubmit`
 * property (confirmed against node_modules/svelte/src/internal/client/dom/elements/events.js:
 * every declarative `onxxx` attribute is wired up via `addEventListener`, so
 * `form.onsubmit` stays `null` forever and a wait on it hangs until timeout).
 * The real, observable signal is that `addEventListener('submit', ...)` gets
 * called on the form element. This init script patches
 * `EventTarget.prototype.addEventListener` to record that moment; Playwright
 * re-injects it before every document load on this page, including a full
 * native reload, so it also re-arms correctly if a click lands before
 * hydration and falls through to a real navigation.
 */
async function installHydrationProbe(page: Page) {
	await page.addInitScript(() => {
		const w = window as unknown as { __submitBound?: boolean };
		w.__submitBound = false;
		const original = EventTarget.prototype.addEventListener;
		EventTarget.prototype.addEventListener = function (
			this: EventTarget,
			type: string,
			...args: unknown[]
		) {
			if (type === 'submit' && this instanceof HTMLFormElement) w.__submitBound = true;
			// @ts-expect-error - passthrough to the original overload signature
			return original.call(this, type, ...args);
		};
	});
}

/** Waits for the signal `installHydrationProbe` records, per test/page instance. */
async function waitForHydration(page: Page) {
	await page.waitForFunction(() => (window as unknown as { __submitBound?: boolean }).__submitBound === true);
}

for (const simCase of cases.filter((c) => !c.manual)) {
	// The repeat cases make one round trip per attempt, each waiting on a fresh
	// widget token, so they need materially more than the default budget.
	const timeout = (simCase.repeat ?? 1) > 1 ? 120_000 : 30_000;

	test(simCase.id, async ({ page }) => {
		test.setTimeout(timeout);

		const otpRequests: string[] = [];
		page.on('request', (r) => {
			if (r.url().includes('/api/otp/request')) otpRequests.push(r.url());
		});

		await installHydrationProbe(page);
		await resetCase(page, simCase.id);
		await page.goto(`/?case=${simCase.id}`);
		await waitForHydration(page);

		// The sidebar is the documented way in, so click it rather than trusting the deep link alone.
		// This click itself can fall through to a native navigation if it lands before hydration
		// (SvelteKit only intercepts already-hydrated links), so re-check hydration after it too.
		await page.locator(`[data-case="${simCase.id}"]`).click();
		await waitForHydration(page);
		await expect(page.getByTestId('case-card')).toBeVisible();

		const phoneInput = page.getByTestId('phone-input');
		await expect(phoneInput).toHaveValue(simCase.phone ?? DEFAULT_PHONE);

		await page.getByTestId('submit').click();

		if (simCase.expected.widgetError) {
			await expect(page.getByTestId('widget-error')).toBeVisible({ timeout: 20_000 });
			expect(otpRequests).toHaveLength(0);
			return;
		}

		await expect(page.getByTestId('result-status')).toHaveText(String(simCase.expected.status), {
			timeout
		});
		await expect(page.getByTestId('result-error')).toHaveText(simCase.expected.errorCode ?? 'ok');
	});
}
