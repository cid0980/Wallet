import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			injectRegister: false,
			devOptions: {
				enabled: false
			},
			// The web app manifest is hand-written in static/manifest.webmanifest so
			// it can omit theme_color: this plugin falls back to its own default
			// (#42b883) whenever the key is absent, and any theme colour we declare
			// is what tints the status and navigation bars of the installed app.
			manifest: false,
			workbox: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,webmanifest}'],
				additionalManifestEntries: [{ url: '/200.html', revision: null }],
				navigateFallback: '/200.html',
				// The Firebase Auth handler path must always reach the network.
				// Caching or rewriting it would break Google sign-in.
				navigateFallbackDenylist: [/^\/__\//]
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
