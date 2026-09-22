import type { KVNamespace } from '@cloudflare/workers-types';

declare global {
	namespace App {
		interface Platform {
			env: {
				RATE_LIMIT: KVNamespace;
			};
		}
	}

	interface TurnstileRenderOptions {
		sitekey: string;
		action?: string;
		callback?: (token: string) => void;
		'error-callback'?: (code: string) => void;
	}

	interface Window {
		turnstile?: {
			render(el: HTMLElement, options: TurnstileRenderOptions): string;
			remove(widgetId: string): void;
			reset(widgetId: string): void;
		};
	}
}

export {};
