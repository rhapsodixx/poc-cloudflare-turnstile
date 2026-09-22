import { expect, test, type Page } from '@playwright/test';
import { cases, DEFAULT_PHONE } from '../../src/lib/cases';

/** Clears this case's rate-limit counters so repeated local runs start clean. */
async function resetCase(page: Page, id: string) {
	const response = await page.request.post('/api/sim/reset', { data: { simCase: id } });
	expect(response.status()).toBe(200);
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

		await resetCase(page, simCase.id);
		await page.goto(`/?case=${simCase.id}`);

		// The sidebar is the documented way in, so click it rather than trusting the deep link alone.
		await page.locator(`[data-case="${simCase.id}"]`).click();
		await expect(page.getByTestId('case-card')).toBeVisible();

		const phoneInput = page.getByTestId('phone-input');
		await expect(phoneInput).toHaveValue(simCase.phone ?? DEFAULT_PHONE);

		// The form is server-rendered before SvelteKit hydrates it, so a submit click that
		// lands before hydration attaches the onsubmit handler falls through to a native
		// GET submission — dropping ?case= and silently reverting to the first case. Give
		// hydration a beat first, the same way resetCase's KV eventual-consistency is handled.
		await page.waitForTimeout(500);
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
