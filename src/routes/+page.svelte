<script lang="ts">
	import { onMount } from 'svelte';

	import GoogleLogin from '$lib/components/auth/GoogleLogin.svelte';
	import VaultSetupForm from '$lib/components/setup/VaultSetupForm.svelte';
	import { createInitialVault, vaultErrorMessage } from '$lib/services/vault-bootstrap';
	import { authState, signInWithGoogle, signOutOfVault, startAuthObserver, stopAuthObserver } from '$lib/stores/auth';
	import {
		clearVaultSession,
		observeVaultSession,
		vaultSession
	} from '$lib/stores/vault-session';
	import type { VaultSetupInput } from '$lib/types/vault';

	let observedEmail: string | null = null;
	let creatingVault = false;
	let signingOut = false;
	let setupError: string | null = null;

	onMount(() => {
		void startAuthObserver();

		return () => {
			clearVaultSession();
			stopAuthObserver();
		};
	});

	$: currentEmail = $authState.user?.email ?? null;

	$: if ($authState.status === 'signed-in' && currentEmail && observedEmail !== currentEmail) {
		observedEmail = currentEmail;
		setupError = null;
		observeVaultSession(currentEmail);
	}

	$: if (($authState.status !== 'signed-in' || !currentEmail) && observedEmail !== null) {
		observedEmail = null;
		clearVaultSession();
	}

	async function handleCreateVault(input: VaultSetupInput): Promise<void> {
		creatingVault = true;
		setupError = null;

		try {
			await createInitialVault(input);
		} catch (error) {
			setupError = vaultErrorMessage(error);
		} finally {
			creatingVault = false;
		}
	}

	async function handleSignOut(): Promise<void> {
		signingOut = true;
		setupError = null;

		try {
			await signOutOfVault();
			clearVaultSession();
		} catch (error) {
			setupError = error instanceof Error ? error.message : 'Could not sign out. Please try again.';
		} finally {
			signingOut = false;
		}
	}

	function retryVaultLookup(): void {
		if (currentEmail) {
			observeVaultSession(currentEmail, true);
		}
	}
</script>

<svelte:head>
	<title>Vault — Shared money tracker</title>
	<meta
		name="description"
		content="A private shared tracker for client payments, spending, and project balances."
	/>
</svelte:head>

<main>
	{#if $authState.status === 'loading'}
		<section class="loading-card" aria-live="polite">
			<span class="spinner" aria-hidden="true"></span>
			<p>Checking your secure Vault session…</p>
		</section>
	{:else if $authState.status === 'signed-out' || $authState.status === 'redirecting' || $authState.status === 'error'}
		<GoogleLogin
			busy={$authState.status === 'redirecting'}
			error={$authState.error}
			onSignIn={signInWithGoogle}
		/>
	{:else if $authState.status === 'signed-in' && $authState.user && currentEmail}
		{#if $vaultSession.status === 'idle' || $vaultSession.status === 'loading'}
			<section class="loading-card" aria-live="polite">
				<span class="spinner" aria-hidden="true"></span>
				<p>Finding your shared Vault…</p>
			</section>
		{:else if $vaultSession.status === 'no-vault'}
			<VaultSetupForm
				user={$authState.user}
				busy={creatingVault || signingOut}
				error={setupError}
				onCreate={handleCreateVault}
				onSignOut={handleSignOut}
			/>
		{:else if $vaultSession.status === 'ready' && $vaultSession.vault}
			<section aria-labelledby="connected-title" class="connected-card">
				<div class="success-mark" aria-hidden="true">✓</div>
				<p class="eyebrow">VAULT CONNECTED</p>
				<h1 id="connected-title">{$vaultSession.vault.name}</h1>
				<p class="intro">
					You are signed in as {$authState.user.email}. The money dashboard and records screens are the
					next build step.
				</p>

				<dl>
					<div>
						<dt>Partner A</dt>
						<dd>{$vaultSession.vault.members.a.name}</dd>
					</div>
					<div>
						<dt>Partner B</dt>
						<dd>{$vaultSession.vault.members.b.name}</dd>
					</div>
				</dl>

				{#if $vaultSession.vaultCount > 1}
					<p class="notice">
						More than one Vault matched this account. Vault currently uses the first available membership.
					</p>
				{/if}

				{#if $vaultSession.fromCache}
					<p class="cache-note">Showing locally cached Vault information. Sync resumes when you reconnect.</p>
				{/if}

				<button class="text-button" type="button" disabled={signingOut} onclick={() => void handleSignOut()}>
					{signingOut ? 'Signing out…' : 'Sign out'}
				</button>
			</section>
		{:else}
			<section aria-labelledby="access-title" class="error-card">
				<p class="eyebrow">VAULT ACCESS</p>
				<h1 id="access-title">We could not open your Vault.</h1>
				<p>{$vaultSession.error ?? 'Please try again.'}</p>
				<div class="actions">
					<button class="primary" type="button" onclick={retryVaultLookup}>Try again</button>
					<button class="secondary" type="button" disabled={signingOut} onclick={() => void handleSignOut()}>
						Use another account
					</button>
				</div>
			</section>
		{/if}
	{/if}
</main>

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(html) {
		--background: #f3f7f4;
		--surface: #ffffff;
		--surface-hover: #f7fbf8;
		--input: #ffffff;
		--text: #15261b;
		--muted: #5d6d62;
		--green: #08743b;
		--border: #dce8df;
		--border-strong: #c2d2c6;
		background: var(--background);
		font-family:
			Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	}

	:global(body) {
		margin: 0;
		min-width: 320px;
	}

	main {
		display: grid;
		min-height: 100dvh;
		place-items: center;
		padding: 24px;
		background:
			radial-gradient(circle at 8% 0%, rgb(46 174 101 / 14%), transparent 31rem),
			radial-gradient(circle at 100% 100%, rgb(16 108 58 / 8%), transparent 28rem),
			var(--background);
	}

	.loading-card,
	.connected-card,
	.error-card {
		width: min(100%, 31rem);
		padding: 30px 24px;
		border: 1px solid var(--border);
		border-radius: 24px;
		background: var(--surface);
		box-shadow: 0 24px 60px rgb(16 54 34 / 13%);
	}

	.loading-card {
		display: grid;
		justify-items: center;
		gap: 14px;
		color: var(--muted);
		text-align: center;
	}

	.loading-card p {
		margin: 0;
	}

	.spinner {
		width: 30px;
		height: 30px;
		border: 3px solid #cfe5d6;
		border-top-color: var(--green);
		border-radius: 50%;
		animation: spin 850ms linear infinite;
	}

	.success-mark {
		display: grid;
		width: 42px;
		height: 42px;
		place-items: center;
		margin-bottom: 18px;
		border-radius: 50%;
		background: #dff6e8;
		color: #08743b;
		font-size: 1.25rem;
		font-weight: 850;
	}

	.eyebrow {
		margin: 0 0 10px;
		color: var(--green);
		font-size: 0.71rem;
		font-weight: 800;
		letter-spacing: 0.13em;
	}

	h1 {
		margin: 0;
		color: var(--text);
		font-size: clamp(1.8rem, 7vw, 2.4rem);
		line-height: 1.08;
		letter-spacing: -0.04em;
	}

	.intro,
	.error-card > p:not(.eyebrow) {
		margin: 14px 0 22px;
		color: var(--muted);
		line-height: 1.55;
	}

	dl {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
		margin: 0 0 20px;
	}

	dl div {
		padding: 13px;
		border: 1px solid var(--border);
		border-radius: 14px;
	}

	dt {
		margin-bottom: 4px;
		color: var(--muted);
		font-size: 0.72rem;
		font-weight: 720;
	}

	dd {
		margin: 0;
		color: var(--text);
		font-size: 0.92rem;
		font-weight: 780;
		word-break: break-word;
	}

	.notice,
	.cache-note {
		margin: 0 0 14px;
		padding: 11px 12px;
		border-radius: 12px;
		background: #f6f0dc;
		color: #735d19;
		font-size: 0.82rem;
		line-height: 1.45;
	}

	.cache-note {
		background: #eaf4ed;
		color: #315e40;
	}

	.text-button,
	.primary,
	.secondary {
		min-height: 46px;
		border-radius: 12px;
		font: inherit;
		font-weight: 780;
		cursor: pointer;
	}

	.text-button {
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--green);
	}

	.primary {
		border: 0;
		padding: 0 18px;
		background: linear-gradient(135deg, #118044, #086332);
		color: #fff;
	}

	.secondary {
		border: 1px solid var(--border-strong);
		padding: 0 18px;
		background: var(--surface);
		color: var(--text);
	}

	.text-button:disabled,
	.primary:disabled,
	.secondary:disabled {
		cursor: wait;
		opacity: 0.65;
	}

	.text-button:focus-visible,
	.primary:focus-visible,
	.secondary:focus-visible {
		outline: 3px solid rgb(31 158 88 / 36%);
		outline-offset: 3px;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-color-scheme: dark) {
		:global(html) {
			--background: #0c1510;
			--surface: #142219;
			--surface-hover: #1a2c20;
			--input: #102017;
			--text: #eef8f0;
			--muted: #b9cdbd;
			--green: #64d38e;
			--border: #294936;
			--border-strong: #40664c;
		}

		.loading-card,
		.connected-card,
		.error-card {
			box-shadow: 0 24px 60px rgb(0 0 0 / 32%);
		}

		.spinner {
			border-color: #294936;
			border-top-color: #64d38e;
		}

		.success-mark {
			background: #173d25;
			color: #74e39b;
		}

		.notice {
			background: #3c3218;
			color: #f3da80;
		}

		.cache-note {
			background: #183a25;
			color: #a5d8b4;
		}
	}
</style>
