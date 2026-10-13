import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			registerType: 'prompt',
			injectRegister: false,
			devOptions: {
				enabled: false
			},
			manifest: {
				name: 'Vault — Shared money tracker',
				short_name: 'Vault',
				description: 'A private shared tracker for client payments, expenses, and project balances.',
				id: '/',
				start_url: '/',
				display: 'standalone',
				background_color: '#f3f7f4',
				theme_color: '#08743b',
				icons: [
					{
						src: '/icons/vault-192.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						src: '/icons/vault-512.png',
						sizes: '512x512',
						type: 'image/png'
					},
					{
						src: '/icons/vault-maskable-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			workbox: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,webmanifest}'],
				additionalManifestEntries: [{ url: '/200.html', revision: null }],
				navigateFallback: '/200.html'
			},
			kit: {
				spa: {
					fallbackMapping: '/200.html'
				},
				includeVersionFile: true
			}
		})
	],
	server: {
		host: '0.0.0.0',
		allowedHosts: true
	},
	preview: {
		host: '0.0.0.0',
		allowedHosts: true
	}
});
