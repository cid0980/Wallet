<script lang="ts">
	import { onMount } from 'svelte';
	import type { User } from 'firebase/auth';

	import VaultWorkspace from '$lib/components/app/VaultWorkspace.svelte';
	import { vaultData } from '$lib/stores/vault-data';
	import type { VaultSummary } from '$lib/types/vault';

	import { onChange, state as demoState } from './mock-state';

	/** The demo signs you in as partner A so the workspace's "you" logic works. */
	const user = {
		uid: 'demo-user-a',
		email: demoState.vault.members.a.email,
		displayName: demoState.vault.members.a.name,
		emailVerified: true
	} as unknown as User;

	let vault: VaultSummary = $state(cloneVault());

	function cloneVault(): VaultSummary {
		return {
			...demoState.vault,
			members: { a: { ...demoState.vault.members.a }, b: { ...demoState.vault.members.b } },
			tags: [...demoState.vault.tags],
			totals: {
				...demoState.vault.totals,
				a: { ...demoState.vault.totals.a },
				b: { ...demoState.vault.totals.b }
			}
		};
	}

	function sync(): void {
		vaultData.set({
			status: 'ready',
			clients: demoState.clients,
			projects: demoState.projects,
			payments: demoState.payments,
			expenses: demoState.expenses,
			mutations: demoState.mutations,
			fromCache: false,
			pendingWrites: false,
			error: null
		});
		vault = cloneVault();
	}

	onMount(() => {
		sync();
		return onChange(sync);
	});

	async function handleSignOut(): Promise<string | null> {
		return null;
	}
</script>

<div class="demo-root">
	<VaultWorkspace {vault} {user} onSignOut={handleSignOut} />
</div>

<div class="demo-badge" role="note">
	<strong>Demo mode</strong>
	<span>In-memory data · no Firebase · changes reset on reload</span>
	<button type="button" onclick={() => location.reload()}>Reset</button>
</div>

<style>
	.demo-root {
		min-height: 100vh;
	}

	.demo-badge {
		position: fixed;
		left: 12px;
		bottom: 12px;
		z-index: 9999;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 11px;
		border-radius: 999px;
		background: rgba(11, 32, 21, 0.92);
		color: #eaf5ee;
		font: 500 11px/1.3 ui-sans-serif, system-ui, sans-serif;
		box-shadow: 0 8px 24px rgba(6, 24, 14, 0.28);
		max-width: calc(100vw - 24px);
		backdrop-filter: blur(6px);
	}

	.demo-badge strong {
		font-weight: 700;
		letter-spacing: 0.02em;
	}

	.demo-badge span {
		opacity: 0.72;
	}

	.demo-badge button {
		border: 1px solid rgba(234, 245, 238, 0.28);
		background: transparent;
		color: inherit;
		font: inherit;
		padding: 3px 9px;
		border-radius: 999px;
		cursor: pointer;
	}

	.demo-badge button:hover {
		background: rgba(234, 245, 238, 0.14);
	}

	@media (max-width: 560px) {
		.demo-badge span {
			display: none;
		}
	}
</style>
