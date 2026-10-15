<script lang="ts">
	import { onMount } from 'svelte';

	import PwaUpdatePrompt from '$lib/components/app/PwaUpdatePrompt.svelte';
	import VaultWorkspace from '$lib/components/app/VaultWorkspace.svelte';
	import GoogleLogin from '$lib/components/auth/GoogleLogin.svelte';
	import VaultSetupForm from '$lib/components/setup/VaultSetupForm.svelte';
	import {
		FIRESTORE_RULES_FILE_URL,
		firestoreRulesConsoleUrl
	} from '$lib/firebase/client';
	import { createInitialVault, vaultErrorMessage } from '$lib/services/vault-bootstrap';
	import { authState, signInWithGoogle, signOutOfVault, startAuthObserver, stopAuthObserver } from '$lib/stores/auth';
	import { clearVaultData, observeVaultData, vaultData } from '$lib/stores/vault-data';
	import {
		clearVaultSession,
		observeVaultSession,
		vaultSession
	} from '$lib/stores/vault-session';
	import type { VaultSetupInput } from '$lib/types/vault';

	let observedEmail: string | null = null;
	let observedVaultId: string | null = null;
	let creatingVault = false;
	let signingOut = false;
	let setupError: string | null = null;
	let startupError: string | null = null;
	let rulesFileCopied = false;

	const rulesConsoleUrl = firestoreRulesConsoleUrl();

	/**
	 * Publishing the rule set is the one step that must happen in the Firebase
	 * console. Hand the user the two links that make it a 30-second job instead
	 * of a copy-paste hunt.
	 */
	async function copyRulesFile(): Promise<void> {
		try {
			await navigator.clipboard.writeText(FIRESTORE_RULES_FILE_URL);
			rulesFileCopied = true;
			setTimeout(() => (rulesFileCopied = false), 4000);
		} catch {
			window.open(FIRESTORE_RULES_FILE_URL, '_blank', 'noopener');
		}
	}

	onMount(() => {
		void startAuthObserver();

		return () => {
			clearVaultData();
			clearVaultSession();
			stopAuthObserver();
		};
	});

	$: currentEmail = $authState.email ?? null;

	$: if ($authState.status === 'signed-in' && currentEmail && observedEmail !== currentEmail) {
		observedEmail = currentEmail;
		setupError = null;
		startVaultSession(currentEmail);
	}

	$: if (($authState.status !== 'signed-in' || !currentEmail) && observedEmail !== null) {
		observedEmail = null;
		observedVaultId = null;
		clearVaultData();
		clearVaultSession();
	}

	$: currentVaultId = $vaultSession.status === 'ready' ? $vaultSession.vault?.id ?? null : null;

	$: if (currentVaultId && observedVaultId !== currentVaultId) {
		observedVaultId = currentVaultId;
		startVaultData(currentVaultId);
	}

	$: if (!currentVaultId && observedVaultId !== null) {
		observedVaultId = null;
		clearVaultData();
	}

	/**
	 * A synchronous throw while creating a Firestore subscription (blocked
	 * storage, unusable offline cache, malformed configuration) used to escape
	 * the reactive statement and tear the render tree down, leaving a blank
	 * screen. Route it into the visible error state instead.
	 */
	function startVaultSession(email: string, force = false): void {
		try {
			startupError = null;
			observeVaultSession(email, force);
		} catch (error) {
			reportStartupFailure('opening your Vault', error);
		}
	}

	function startVaultData(vaultId: string, force = false): void {
		try {
			observeVaultData(vaultId, force);
		} catch (error) {
			reportStartupFailure('loading your records', error);
		}
	}

	function reportStartupFailure(activity: string, error: unknown): void {
		const message = error instanceof Error ? error.message : 'Vault could not start on this device.';
		console.info('[vault:startup] failed while ' + activity, error);
		startupError = `Vault ran into a problem while ${activity}: ${message}`;
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
			observedVaultId = null;
			clearVaultData();
			clearVaultSession();
		} catch (error) {
			setupError = error instanceof Error ? error.message : 'Could not sign out. Please try again.';
		} finally {
			signingOut = false;
		}
	}

	function retryVaultLookup(): void {
		if (currentEmail) {
			startVaultSession(currentEmail, true);
		}
	}

	function retryVaultData(): void {
		if (currentVaultId) {
			startVaultData(currentVaultId, true);
		}
	}

	/** Rebuilds both subscriptions from scratch after an unexpected state. */
	function restartVaultStartup(): void {
		startupError = null;
		clearVaultSession();
		clearVaultData();
		observedEmail = null;
		observedVaultId = null;

		if (currentEmail) {
			observedEmail = currentEmail;
			startVaultSession(currentEmail);
		}
	}
</script>

<svelte:head>
	<title>Vault — Shared money tracker</title>
	<meta
		name="description"
		content="A private shared tracker for client payments, spending, and project balances."
	/>
	<meta name="theme-color" content="#08743b" />
</svelte:head>

{#if $authState.status === 'signed-in' && $authState.user && currentEmail && $vaultSession.status === 'ready' && $vaultSession.vault && $vaultData.status === 'ready'}
	<svelte:boundary
		onerror={(error) => console.info('[vault:workspace] render failed', error)}
	>
		{#snippet failed(error)}
			<main class="gate">
				<section aria-labelledby="crash-title" class="error-card">
					<p class="eyebrow">VAULT SCREEN</p>
					<h1 id="crash-title">This screen could not be drawn.</h1>
					<p>
						{error instanceof Error ? error.message : 'The Vault screen hit an unexpected problem.'}
					</p>
					<div class="actions">
						<button class="primary" type="button" onclick={() => window.location.reload()}>
							Reload Vault
						</button>
						<button class="secondary" type="button" disabled={signingOut} onclick={() => void handleSignOut()}>
							Sign out
						</button>
					</div>
				</section>
			</main>
		{/snippet}
		<VaultWorkspace vault={$vaultSession.vault} user={$authState.user} onSignOut={handleSignOut} />
	</svelte:boundary>
{:else}
	<main class="gate">
		{#if $authState.status === 'loading'}
			<section class="loading-card" aria-live="polite">
				<span class="spinner" aria-hidden="true"></span>
				<p>Checking your secure Vault session…</p>
			</section>
		{:else if $authState.status === 'signed-out' || $authState.status === 'signing-in' || $authState.status === 'error'}
			<GoogleLogin
				busy={$authState.status === 'signing-in'}
				error={$authState.error}
				diagnostic={$authState.diagnostic}
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
			{:else if $vaultSession.status === 'error'}
				<section aria-labelledby="access-title" class="error-card">
					<p class="eyebrow">VAULT ACCESS</p>
					<h1 id="access-title">We could not open your Vault.</h1>
					<p>{$vaultSession.error ?? 'Please try again.'}</p>
					<div class="actions">
						<button class="primary" type="button" onclick={retryVaultLookup}>Try again</button>
						{#if rulesConsoleUrl}
							<a class="secondary" href={rulesConsoleUrl} target="_blank" rel="noopener noreferrer">
								Open Firestore rules
							</a>
						{/if}
						<button class="secondary" type="button" onclick={() => void copyRulesFile()}>
							{rulesFileCopied ? 'Link copied ✓' : 'Copy rules file link'}
						</button>
						<button class="secondary" type="button" disabled={signingOut} onclick={() => void handleSignOut()}>
							Use another account
						</button>
					</div>
				</section>
			{:else if $vaultSession.status === 'ready' && $vaultSession.vault && ($vaultData.status === 'loading' || $vaultData.status === 'idle')}
				<section class="loading-card" aria-live="polite">
					<span class="spinner" aria-hidden="true"></span>
					<p>Loading your shared records…</p>
				</section>
			{:else if $vaultData.status === 'error'}
				<section aria-labelledby="data-title" class="error-card">
					<p class="eyebrow">VAULT DATA</p>
					<h1 id="data-title">We could not load your records.</h1>
					<p>{$vaultData.error ?? 'Please try again.'}</p>
					<div class="actions">
						<button class="primary" type="button" onclick={retryVaultData}>Try again</button>
						<button class="secondary" type="button" disabled={signingOut} onclick={() => void handleSignOut()}>
							Sign out
						</button>
					</div>
				</section>
			{:else}
				{@render startupCard()}
			{/if}
		{:else}
			{@render startupCard()}
		{/if}
	</main>
{/if}

{#snippet startupCard()}
	<!-- Nothing may render an empty page. Any unexpected combination of auth,
	     session, and data states lands here with the live state shown, so a
	     blank screen can never hide a problem again. -->
	<section aria-labelledby="stuck-title" class="error-card">
		<p class="eyebrow">VAULT STARTUP</p>
		<h1 id="stuck-title">Your Vault did not finish starting.</h1>
		<p>
			{startupError ??
				'Vault could not reach a usable state on this device. Try again, and if it repeats, sign out and back in.'}
		</p>
		<dl class="diagnostics">
			<div><dt>Session</dt><dd>{$vaultSession.status}</dd></div>
			<div><dt>Records</dt><dd>{$vaultData.status}</dd></div>
			<div><dt>Account</dt><dd>{currentEmail ?? 'no email shared'}</dd></div>
			<div><dt>User ID</dt><dd>{$authState.user?.uid ?? 'none'}</dd></div>
		</dl>
		<div class="actions">
			<button class="primary" type="button" onclick={restartVaultStartup}>Try again</button>
			<button class="secondary" type="button" disabled={signingOut} onclick={() => void handleSignOut()}>
				Sign out
			</button>
		</div>
	</section>
{/snippet}

<PwaUpdatePrompt />

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
		min-width: 320px;
		margin: 0;
		background:
			radial-gradient(circle at 8% 0%, rgb(46 174 101 / 14%), transparent 31rem),
			radial-gradient(circle at 100% 100%, rgb(16 108 58 / 8%), transparent 28rem),
			var(--background);
	}

	.gate {
		display: grid;
		min-height: 100dvh;
		place-items: center;
		padding: 24px;
	}

	.loading-card,
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

	.error-card > p:not(.eyebrow) {
		margin: 14px 0 22px;
		color: var(--muted);
		line-height: 1.55;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.diagnostics {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: 8px;
		margin: 0 0 18px;
	}

	.diagnostics div {
		padding: 9px 11px;
		border: 1px solid var(--border);
		border-radius: 11px;
		background: var(--surface-hover);
	}

	.diagnostics dt {
		color: var(--muted);
		font-size: 0.68rem;
		font-weight: 720;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.diagnostics dd {
		margin: 3px 0 0;
		color: var(--text);
		font-size: 0.82rem;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.primary,
	.secondary {
		display: inline-flex;
		min-height: 46px;
		align-items: center;
		border-radius: 12px;
		font: inherit;
		font-weight: 780;
		cursor: pointer;
	}

	a.secondary {
		text-decoration: none;
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

	.primary:focus-visible,
	.secondary:focus-visible {
		outline: 3px solid rgb(31 158 88 / 36%);
		outline-offset: 3px;
	}

	.primary:disabled,
	.secondary:disabled {
		cursor: wait;
		opacity: 0.65;
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
		.error-card {
			box-shadow: 0 24px 60px rgb(0 0 0 / 32%);
		}

		.spinner {
			border-color: #294936;
			border-top-color: #64d38e;
		}
	}
</style>
