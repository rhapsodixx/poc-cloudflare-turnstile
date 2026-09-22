import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'tests/e2e',
	// One worker: every case shares the same origin and IP, so parallel runs
	// would contend on the per-IP rate-limit counters.
	workers: 1,
	fullyParallel: false,
	use: {
		baseURL: 'http://localhost:5173',
		trace: 'on-first-retry',
		// ponytail: this sandbox's network allowlist blocks cdn.playwright.dev, so the
		// pinned "Chrome for Testing" binary can't be downloaded. Fall back to the
		// system-installed Chrome (same Chromium engine) instead of vendoring one.
		// Drop this line once `bunx playwright install chromium` works in CI/prod.
		channel: 'chrome'
	},
	webServer: {
		command: 'bun run dev',
		port: 5173,
		reuseExistingServer: !process.env.CI,
		timeout: 60_000
	}
});
