<script lang="ts">
	import { onMount } from 'svelte';
	import { registerSW } from 'virtual:pwa-register';

	import Icon from '$lib/components/ui/Icon.svelte';

	let offlineReady = false;
	let updateAvailable = false;
	let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null;
	let dismissed = false;

	onMount(() => {
		let reloading = false;

		updateServiceWorker = registerSW({
			immediate: true,
			onOfflineReady() {
				offlineReady = true;
			},
			onNeedRefresh() {
				updateAvailable = true;

				// Take the update instead of waiting for a tap. A cached old bundle
				// once hid several real fixes from the person using the app. The
				// guard keeps a single reload per page load.
				if (!reloading) {
					reloading = true;
					void refresh();
				}
			},
			onRegisteredSW(_swUrl, registration) {
				// Re-check while the app stays open, so a long-lived tab updates too.
				setInterval(() => void registration?.update(), 30 * 60 * 1000);
			}
		});
	});

	async function refresh(): Promise<void> {
		if (updateServiceWorker) {
			await updateServiceWorker(true);
		}
	}
</script>

{#if !dismissed && (offlineReady || updateAvailable)}
	<aside class="pwa" aria-live="polite">
		<div>
			<strong>{updateAvailable ? 'A Vault update is ready.' : 'Vault is ready for offline use.'}</strong>
			<p>
				{updateAvailable
					? 'Refresh to use the newest version.'
					: 'The app shell is stored on this device now.'}
			</p>
		</div>
		<div class="cluster">
			{#if updateAvailable}
				<button class="btn btn--primary btn--sm" type="button" onclick={() => void refresh()}>
					<Icon name="refresh" size={16} /> Refresh
				</button>
			{/if}
			<button class="icon-btn" type="button" aria-label="Dismiss message" onclick={() => (dismissed = true)}>
				<Icon name="close" size={18} />
			</button>
		</div>
	</aside>
{/if}
