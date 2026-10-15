import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	plugins: [svelte()],
	build: {
		outDir: 'tests/interaction-harness/out',
		emptyOutDir: true,
		lib: { entry: fileURLToPath(new URL('./entry.ts', import.meta.url)), formats: ['es'], fileName: 'entry' },
		rollupOptions: { output: { inlineDynamicImports: true } }
	}
});
