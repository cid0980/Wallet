// Builds tests/render-harness/entry.ts for Node. Uses the plain Svelte plugin
// plus path aliases so the real +page.svelte renders with stubbed stores.
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const here = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url));

export default defineConfig({
	plugins: [svelte({ compilerOptions: { dev: false } })],
	resolve: {
		alias: [
			{ find: '$app/environment', replacement: here('env-stub.ts') },
			{ find: 'virtual:pwa-register', replacement: here('pwa-stub.ts') },
			{ find: '$lib/stores/auth', replacement: here('stubs.ts') },
			{ find: '$lib/stores/vault-session', replacement: here('stubs.ts') },
			{ find: '$lib/stores/vault-data', replacement: here('stubs.ts') },
			{ find: '$lib', replacement: fileURLToPath(new URL('../../src/lib', import.meta.url)) }
		]
	},
	build: {
		ssr: true,
		outDir: 'tests/render-harness/out',
		emptyOutDir: true,
		minify: false,
		rollupOptions: {
			input: here('entry.ts'),
			output: { entryFileNames: 'entry.js', format: 'es', inlineDynamicImports: true }
		}
	},
	ssr: { noExternal: true }
});
