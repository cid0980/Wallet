<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	export let busy = false;
	export let error: string | null = null;
	export let diagnostic: string | null = null;
	export let settingsConsoleUrl: string | null = null;
	export let onSignIn: (email: string, password: string) => Promise<void> | void;
	export let onCreateAccount: (email: string, password: string) => Promise<void> | void;

	let mode: 'sign-in' | 'create' = 'sign-in';
	let email = '';
	let password = '';
	let showPassword = false;
	let validationError = '';

	$: shownError = validationError || error;
	$: submitLabel = busy
		? mode === 'create'
			? 'Creating your account…'
			: 'Signing in…'
		: mode === 'create'
			? 'Create account'
			: 'Sign in';

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		validationError = '';

		const address = email.trim();

		if (!address || !address.includes('@')) {
			validationError = 'Enter your email address.';
			return;
		}

		if (password.length < 8) {
			validationError = 'Enter your password — at least 8 characters.';
			return;
		}

		if (mode === 'create') {
			void onCreateAccount(address, password);
			return;
		}

		void onSignIn(address, password);
	}

	function switchMode(next: 'sign-in' | 'create'): void {
		mode = next;
		validationError = '';
	}
</script>

<section class="auth" aria-labelledby="login-title">
	<div class="auth__mark" aria-hidden="true">V</div>
	<p class="eyebrow">Vault</p>
	<h1 class="h1 auth__title" id="login-title">
		{mode === 'create' ? 'Create your account.' : 'One shared place for project money.'}
	</h1>
	<p class="lead auth__lead">
		{mode === 'create'
			? 'Use the email address you want tied to this vault. Your partner creates their own account with their own email.'
			: 'Sign in with the email and password you created for this vault.'}
	</p>

	<form class="form" onsubmit={submit}>
		<label class="field">
			<span class="field__label">Email</span>
			<input
				class="input"
				bind:value={email}
				type="email"
				autocomplete="email"
				inputmode="email"
				autocapitalize="none"
				spellcheck="false"
				placeholder="you@example.com"
				disabled={busy}
				required
			/>
		</label>

		<label class="field">
			<span class="field__label">
				Password
				<em class="field__optional">{mode === 'create' ? 'at least 8 characters' : ''}</em>
			</span>
			<span class="pw-field">
				<input
					class="input"
					bind:value={password}
					type={showPassword ? 'text' : 'password'}
					autocomplete={mode === 'create' ? 'new-password' : 'current-password'}
					placeholder="Your password"
					disabled={busy}
					required
				/>
				<button class="pw-toggle" type="button" disabled={busy} onclick={() => (showPassword = !showPassword)}>
					{showPassword ? 'Hide' : 'Show'}
				</button>
			</span>
		</label>

		{#if shownError}
			<p class="notice notice--error" role="alert">{shownError}</p>
		{/if}

		<button class="btn btn--primary btn--block" type="submit" disabled={busy}>{submitLabel}</button>
	</form>

	<p class="auth__switch">
		{#if mode === 'sign-in'}
			First time here?
			<button class="linkish" type="button" disabled={busy} onclick={() => switchMode('create')}>
				Create the account
			</button>
		{:else}
			Already set up?
			<button class="linkish" type="button" disabled={busy} onclick={() => switchMode('sign-in')}>
				Sign in
			</button>
		{/if}
	</p>

	{#if diagnostic}
		<details class="raw">
			<summary>What Vault received from Firebase</summary>
			<pre>{diagnostic}</pre>
		</details>
	{/if}

	{#if settingsConsoleUrl}
		<a class="auth__switch" href={settingsConsoleUrl} target="_blank" rel="noopener noreferrer">
			Open Firebase sign-in settings <Icon name="external" size={13} />
		</a>
	{/if}

	<p class="auth__foot">
		One account per person, using the same email you listed in the vault's member list. Both accounts see the
		same records.
	</p>
</section>
