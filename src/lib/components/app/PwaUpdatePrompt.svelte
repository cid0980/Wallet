<script lang="ts">
	import { onMount } from 'svelte';
	import { registerSW } from 'virtual:pwa-register';

	let offlineReady = false;
	let updateAvailable = false;
	let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null;
	let dismissed = false;

	onMount(() => {
		updateServiceWorker = registerSW({
			onOfflineReady() {
				offlineReady = true;
			},
			onNeedRefresh() {
				updateAvailable = true;
			}
		});
	});

	async function refresh(): Promise<void> {
		if (updateServiceWorker) {
			await updateServiceWorker(true);
		}
	}

	function dismiss(): void {
		dismissed = true;
	}
</script>

{#if !dismissed && (offlineReady || updateAvailable)}
	<aside class="pwa-notice" aria-live="polite">
		<div>
			<strong>{updateAvailable ? 'A Vault update is ready.' : 'Vault is ready for offline use.'}</strong>
			<p>{updateAvailable ? 'Refresh when you are ready to use the latest version.' : 'Your app shell is stored on this device.'}</p>
		</div>
		<div class="actions">
			{#if updateAvailable}
				<button class="refresh" type="button" onclick={() => void refresh()}>Refresh</button>
			{/if}
			<button class="dismiss" type="button" onclick={dismiss} aria-label="Dismiss notification">×</button>
		</div>
	</aside>
{/if}

<style>
	.pwa-notice {
		position: fixed;
		z-index: 30;
		right: 16px;
		bottom: calc(88px + env(safe-area-inset-bottom));
		left: 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		max-width: 34rem;
		margin: auto;
		padding: 13px 13px 13px 15px;
		border: 1px solid #bfe6ce;
		border-radius: 15px;
		background: #f5fcf7;
		box-shadow: 0 14px 35px rgb(13 65 33 / 18%);
		color: #183c24;
	}

	strong {
		display: block;
		font-size: 0.83rem;
	}

	p {
		margin: 3px 0 0;
		color: #497156;
		font-size: 0.75rem;
		line-height: 1.35;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	button {
		font: inherit;
		cursor: pointer;
	}

	.refresh {
		min-height: 34px;
		border: 0;
		border-radius: 9px;
		padding: 0 10px;
		background: #08743b;
		color: white;
		font-size: 0.75rem;
		font-weight: 800;
	}

	.dismiss {
		display: grid;
		width: 30px;
		height: 30px;
		place-items: center;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: #497156;
		font-size: 1.2rem;
	}

	button:focus-visible {
		outline: 3px solid rgb(31 158 88 / 36%);
		outline-offset: 2px;
	}

	@media (min-width: 680px) {
		.pwa-notice {
			bottom: 28px;
		}
	}

	@media (prefers-color-scheme: dark) {
		.pwa-notice {
			border-color: #285a3b;
			background: #173122;
			color: #e1f7e8;
		}

		p,
		.dismiss {
			color: #abd4b9;
		}
	}
</style>
