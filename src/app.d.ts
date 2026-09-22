import type { KVNamespace } from '@cloudflare/workers-types';

declare global {
	namespace App {
		interface Platform {
			env: {
				RATE_LIMIT: KVNamespace;
			};
		}
	}
}

export {};
