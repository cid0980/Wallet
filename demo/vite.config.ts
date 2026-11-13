import { fileURLToPath } from 'node:url';

import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const demoRoot = fileURLToPath(new URL('.', import.meta.url));
const srcLib = fileURLToPath(new URL('../src/lib', import.meta.url));

export default defineConfig({
	root: demoRoot,
	plugins: [svelte({ preprocess: vitePreprocess() })],
	resolve: {
		alias: [
			// The demo swaps the Firestore service layer for an in-memory one.
			{ find: /^\$lib\/services\/vault-data$/, replacement: `${demoRoot}mock-services.ts` },
			{ find: /^\$lib\//, replacement: `${srcLib}/` }
		]
	},
	server: {
		host: '0.0.0.0',
		port: 5173,
		strictPort: true,
		allowedHosts: true
	},
	preview: {
		host: '0.0.0.0',
		allowedHosts: true
	}
});
