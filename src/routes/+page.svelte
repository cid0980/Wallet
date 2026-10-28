<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	import PwaUpdatePrompt from '$lib/components/app/PwaUpdatePrompt.svelte';
	import SkeletonList from '$lib/components/ui/SkeletonList.svelte';
	import VaultWorkspace from '$lib/components/app/VaultWorkspace.svelte';
	import EmailLogin from '$lib/components/auth/EmailLogin.svelte';
	import VaultSetupForm from '$lib/components/setup/VaultSetupForm.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import {
		FIRESTORE_RULES_FILE_URL,
		authSettingsConsoleUrl,
		firestoreRulesConsoleUrl
	} from '$lib/firebase/client';
	import { inspectAccount, formatInspection } from '$lib/firebase/account';
	import {
		createInitialVault,
		probeVaultReadAccess,
		vaultErrorMessage
	} from '$lib/services/vault-bootstrap';
	import {
		PendingWritesTimeoutError,
		authState,
		checkEmailVerified,
		createAccountWithEmail,
		resendVerificationEmail,
		sendVaultPasswordReset,
		signInWithEmail,
		signOutOfVault,
		startAuthObserver,
		stopAuthObserver,
		type SignOutMode
	} from '$lib/stores/auth';
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
	let accessCheckRunning = false;
	let accessCheckSummary: string | null = null;
	let accessCheckDetail: string | null = null;

	const rulesConsoleUrl = firestoreRulesConsoleUrl();
	const settingsConsoleUrl = authSettingsConsoleUrl();

	/**
	 * Runs when the vault lookup is refused: reads one document that never
	 * exists and reports what the account looks like, so a single screenshot
	 * says whether the rules, the claims, or a stale cached bundle is at fault.
	 */
	async function runAccessCheck(): Promise<void> {
		if (!browser || accessCheckRunning) {
			return;
		}

		accessCheckRunning = true;
		accessCheckSummary = null;
		accessCheckDetail = null;

		try {
			const user = $authState.user;
			const [probe, inspection] = await Promise.all([
				probeVaultReadAccess(),
				inspectAccount(user)
			]);

			const claims = formatInspection(inspection);

			accessCheckSummary = probe.readAllowed
				? 'Test read: allowed ✓ — the rules accept this account, so only the vault document is missing.'
				: `Test read: ${probe.code} ✗ — ${probe.detail}`;
			accessCheckDetail = [
				claims,
				`token sign_in_provider: ${inspection.signInProvider ?? 'missing'}`
			].join('\n');
		} catch (error) {
			accessCheckSummary = `Access check failed: ${error instanceof Error ? error.message : 'unknown error'}`;
		} finally {
			accessCheckRunning = false;
		}
	}

	// A refused lookup triggers the check immediately.
	$: if ($vaultSession.status === 'error' && accessCheckSummary === null && !accessCheckRunning) {
		void runAccessCheck();
	}

	/**
	 * Publishing the rule set is the one step that must happen in the Firebase
	 * console. Hand the user the link that makes it a 30-second job instead of
	 * a copy-paste hunt.
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

	$: currentVaultId = $vaultSession.status === 'ready' ? ($vaultSession.vault?.id ?? null) : null;

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

	/**
	 * Returns a user-readable failure message, or null on success. The
	 * workspace shows it as a toast; the setup form shows `setupError`.
	 * Unsent offline changes veto the clear-local-data path: the user stays
	 * signed in and is told exactly how to finish safely.
	 */
	async function handleSignOut(mode: SignOutMode = 'keep'): Promise<string | null> {
		signingOut = true;
		setupError = null;

		try {
			await signOutOfVault(mode);
			observedVaultId = null;
			clearVaultData();
			clearVaultSession();
			return null;
		} catch (error) {
			const message =
				error instanceof PendingWritesTimeoutError || error instanceof Error
					? error.message
					: 'Could not sign out. Please try again.';
			setupError = message;
			return message;
		} finally {
			signingOut = false;
		}
	}

	let verificationBusy = false;

	async function handleCheckVerified(): Promise<void> {
		verificationBusy = true;
		try {
			await checkEmailVerified();
		} finally {
			verificationBusy = false;
		}
	}

	async function handleResendVerification(): Promise<void> {
		verificationBusy = true;
		try {
			await resendVerificationEmail();
		} finally {
			verificationBusy = false;
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
	<meta name="theme-color" content="#0b7a44" />
</svelte:head>

{#if $authState.status === 'signed-in' && $authState.user && currentEmail && $vaultSession.status === 'ready' && $vaultSession.vault && $vaultData.status === 'ready'}
	<svelte:boundary onerror={(error) => console.info('[vault:workspace] render failed', error)}>
		{#snippet failed(error)}
			<div class="page">
				<section class="card card--pad narrow" aria-labelledby="crash-title">
					<p class="eyebrow">Vault screen</p>
					<h1 class="h1 mt-10" id="crash-title">This screen could not be drawn.</h1>
					<p class="lead mt-10">
						{error instanceof Error ? error.message : 'The Vault screen hit an unexpected problem.'}
					</p>
					<div class="grid-2 mt-14">
						<button class="btn btn--primary" type="button" onclick={() => window.location.reload()}>
							<Icon name="refresh" size={17} /> Reload
						</button>
						<button class="btn btn--outline" type="button" disabled={signingOut} onclick={() => void handleSignOut()}>
							Sign out
						</button>
					</div>
				</section>
			</div>
		{/snippet}
		<VaultWorkspace vault={$vaultSession.vault} user={$authState.user} onSignOut={handleSignOut} />
	</svelte:boundary>
{:else}
	<div class="page">
		{#if $authState.status === 'loading'}
			<div class="card card--pad narrow loader" aria-live="polite">
				<span class="spinner" aria-hidden="true"></span>
				<p class="muted">Checking your secure Vault session…</p>
			</div>
		{:else if $authState.status === 'signed-out' || $authState.status === 'signing-in' || $authState.status === 'error'}
			<EmailLogin
				busy={$authState.status === 'signing-in'}
				error={$authState.error}
				notice={$authState.notice}
				diagnostic={$authState.diagnostic}
				settingsConsoleUrl={settingsConsoleUrl}
				onSignIn={signInWithEmail}
				onCreateAccount={createAccountWithEmail}
				onResetPassword={sendVaultPasswordReset}
			/>
		{:else if $authState.status === 'needs-verification' && $authState.user && currentEmail}
			<section class="card card--pad narrow" aria-labelledby="verify-title">
				<p class="eyebrow">One last step</p>
				<h1 class="h1 mt-10" id="verify-title">Verify your email</h1>
				<p class="lead mt-10">
					Your vault opens only for the verified owner of <strong>{currentEmail}</strong>. Open the
					verification link in that inbox, then come back here.
				</p>

				{#if $authState.error}
					<p class="notice notice--error mt-14" role="alert">{$authState.error}</p>
				{:else if $authState.notice}
					<p class="notice mt-14" role="status">{$authState.notice}</p>
				{/if}

				<div class="form mt-14">
					<button class="btn btn--primary btn--block" type="button" disabled={verificationBusy} onclick={() => void handleCheckVerified()}>
						<Icon name="check" size={17} /> {verificationBusy ? 'Checking…' : 'I’ve verified'}
					</button>
					<button class="btn btn--outline btn--block" type="button" disabled={verificationBusy} onclick={() => void handleResendVerification()}>
						Resend the link
					</button>
				</div>

				<p class="tiny mt-14">
					No email after a minute? Check spam, then resend — only the newest link works. This step is what
					stops someone else from claiming your invited address.
				</p>

				<button class="btn btn--quiet btn--block mt-10" type="button" disabled={signingOut} onclick={() => void handleSignOut()}>
					Use another account
				</button>
			</section>
		{:else if $authState.status === 'signed-in' && $authState.user && currentEmail}
			{#if $vaultSession.status === 'idle' || $vaultSession.status === 'loading'}
				<div class="card card--pad narrow loader" aria-live="polite">
					<span class="spinner" aria-hidden="true"></span>
					<p class="muted">Finding your shared Vault…</p>
				</div>
			{:else if $vaultSession.status === 'no-vault'}
				<VaultSetupForm
					user={$authState.user}
					busy={creatingVault || signingOut}
					error={setupError}
					onCreate={handleCreateVault}
					onSignOut={() => void handleSignOut()}
				/>
			{:else if $vaultSession.status === 'error'}
				<section class="card card--pad wide" aria-labelledby="access-title">
					<p class="eyebrow">Vault access</p>
					<h1 class="h1 mt-10" id="access-title">We could not open your Vault.</h1>
					<p class="lead mt-10">{$vaultSession.error ?? 'Please try again.'}</p>

					<div class="notice mt-14">
						<p>
							<strong>Test read:</strong>
							{accessCheckRunning && !accessCheckSummary
								? 'checking…'
								: (accessCheckSummary ?? 'not run yet')}
						</p>
						{#if accessCheckDetail}
							<details class="raw">
								<summary>What the account sent with the request</summary>
								<pre>{accessCheckDetail}</pre>
							</details>
						{/if}
					</div>

					<div class="notice notice--warn mt-14">
						<p class="notice__title">Most common cause</p>
						<p class="mt-10">
							The Firestore rules published in the Firebase console are older than this app. Paste the
							current <code>firestore.rules</code> from the repository and press Publish, then try again.
						</p>
					</div>

					<div class="cluster mt-14">
						<button class="btn btn--primary" type="button" onclick={retryVaultLookup}>
							<Icon name="refresh" size={17} /> Try again
						</button>
						{#if rulesConsoleUrl}
							<a class="btn btn--outline" href={rulesConsoleUrl} target="_blank" rel="noopener noreferrer">
								Open Firestore rules <Icon name="external" size={15} />
							</a>
						{/if}
						<button class="btn btn--outline" type="button" onclick={() => void copyRulesFile()}>
							<Icon name={rulesFileCopied ? 'check' : 'copy'} size={16} />
							{rulesFileCopied ? 'Link copied' : 'Copy rules link'}
						</button>
						<button class="btn btn--quiet" type="button" disabled={signingOut} onclick={() => void handleSignOut()}>
							Use another account
						</button>
					</div>
				</section>
			{:else if $vaultSession.status === 'ready' && $vaultSession.vault && ($vaultData.status === 'loading' || $vaultData.status === 'idle')}
				<div class="card card--pad narrow" aria-busy="true">
					<p class="muted mb-14">Loading your shared records…</p>
					<SkeletonList label="Loading your shared records…" />
				</div>
			{:else if $vaultData.status === 'error'}
				<section class="card card--pad narrow" aria-labelledby="data-title">
					<p class="eyebrow">Vault records</p>
					<h1 class="h1 mt-10" id="data-title">We could not load your records.</h1>
					<p class="lead mt-10">{$vaultData.error ?? 'Please try again.'}</p>
					<div class="grid-2 mt-14">
						<button class="btn btn--primary" type="button" onclick={retryVaultData}>
							<Icon name="refresh" size={17} /> Try again
						</button>
						<button class="btn btn--outline" type="button" disabled={signingOut} onclick={() => void handleSignOut()}>
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
	</div>
{/if}

{#snippet startupCard()}
	<!-- Nothing may render an empty page. Any unexpected combination of auth,
	     session, and data states lands here with the live state shown, so a
	     blank screen can never hide a problem again. -->
	<section class="card card--pad narrow" aria-labelledby="stuck-title">
		<p class="eyebrow">Vault startup</p>
		<h1 class="h1 mt-10" id="stuck-title">Your Vault did not finish starting.</h1>
		<p class="lead mt-10">
			{startupError ??
				'Vault could not reach a usable state on this device. Try again, and if it repeats, sign out and back in.'}
		</p>
		<dl class="diagnostics mt-14">
			<div><dt>Session</dt><dd>{$vaultSession.status}</dd></div>
			<div><dt>Records</dt><dd>{$vaultData.status}</dd></div>
			<div><dt>Account</dt><dd>{currentEmail ?? 'no email'}</dd></div>
			<div><dt>User ID</dt><dd>{$authState.user?.uid ?? 'none'}</dd></div>
		</dl>
		<div class="grid-2 mt-14">
			<button class="btn btn--primary" type="button" onclick={restartVaultStartup}>
				<Icon name="refresh" size={17} /> Try again
			</button>
			<button class="btn btn--outline" type="button" disabled={signingOut} onclick={() => void handleSignOut()}>
				Sign out
			</button>
		</div>
	</section>
{/snippet}

<PwaUpdatePrompt />
