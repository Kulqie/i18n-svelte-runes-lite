import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
	plugins: [svelte({ hot: false })],
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'jsdom',
		globals: true,
		// Required for Svelte 5 component testing
		alias: {
			// Force Svelte to use the browser build instead of server build
			svelte: 'svelte'
		},
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			include: ['src/**/*.ts', 'src/**/*.svelte'],
			exclude: ['tests/**']
		}
	},
	// Resolve Svelte to browser bundle
	resolve: {
		conditions: ['browser']
	}
});
