import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'tests/e2e',
	// html reporter is what CI uploads as an artifact on failure.
	reporter: [['list'], ['html', { open: 'never' }]],
	// One worker: every case shares the same origin and IP, so parallel runs
	// would contend on the per-IP rate-limit counters.
	workers: 1,
	fullyParallel: false,
	use: {
		baseURL: 'http://localhost:5173',
		trace: 'on-first-retry',
		// ponytail: opt-in only. On a normal machine `bunx playwright install chromium`
		// works and this stays undefined, so Playwright's own bundled Chromium is used
		// (the brief's default). Some sandboxes block the download CDN outright; set
		// PLAYWRIGHT_CHANNEL=chrome there to fall back to the system-installed Chrome
		// instead. Never required — do not set it unless `playwright install` fails.
		channel: process.env.PLAYWRIGHT_CHANNEL as 'chrome' | undefined
	},
	webServer: {
		command: 'bun run dev',
		port: 5173,
		reuseExistingServer: !process.env.CI,
		timeout: 60_000
	}
});
