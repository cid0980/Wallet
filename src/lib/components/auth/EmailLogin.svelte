<script lang="ts">
	export let busy = false;
	export let error: string | null = null;
	export let diagnostic: string | null = null;
	export let settingsConsoleUrl: string | null = null;
	export let onSignIn: (email: string, password: string) => Promise<void> | void;
	export let onCreateAccount: (email: string, password: string) => Promise<void> | void;

	let mode: 'sign-in' | 'create' = 'sign-in';
	let email = '';
	let password = '';
	let validationError = '';

	$: shownError = validationError || error;

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		validationError = '';

		const address = email.trim();

		if (!address || !address.includes('@')) {
			validationError = 'Enter your email address.';
			return;
		}

		if (password.length < 8) {
			validationError = 'Enter your password (at least 8 characters).';
			return;
		}

		if (mode === 'create') {
			void onCreateAccount(address, password);
			return;
		}

		void onSignIn(address, password);
	}
</script>

<section aria-labelledby="login-title" class="card">
	<div class="mark" aria-hidden="true">V</div>
	<p class="eyebrow">VAULT</p>
	<h1 id="login-title">One shared place for project money.</h1>
	<p class="intro">
		Sign in with the email and password you both use for this vault.
	</p>

	<form onsubmit={submit}>
		<label>
			<span>Email</span>
			<input
				bind:value={email}
				type="email"
				autocomplete="email"
				inputmode="email"
				placeholder="you@gmail.com"
				disabled={busy}
				required
			/>
		</label>

		<label>
			<span>Password</span>
			<input
				bind:value={password}
				type="password"
				autocomplete={mode === 'create' ? 'new-password' : 'current-password'}
				placeholder="At least 8 characters"
				disabled={busy}
				required
			/>
		</label>

		{#if shownError}
			<p class="error" role="alert">{shownError}</p>
		{/if}

		<button class="primary" type="submit" disabled={busy}>
			{busy
				? mode === 'create'
					? 'Creating account…'
					: 'Signing in…'
				: mode === 'create'
					? 'Create account'
					: 'Sign in'}
		</button>
	</form>

	<p class="switch">
		{#if mode === 'sign-in'}
			First time here?
			<button
				class="text-button"
				type="button"
				disabled={busy}
				onclick={() => {
					mode = 'create';
					validationError = '';
				}}
			>
				Create the account
			</button>
		{:else}
			Already created your account?
			<button
				class="text-button"
				type="button"
				disabled={busy}
				onclick={() => {
					mode = 'sign-in';
					validationError = '';
				}}
			>
				Sign in
			</button>
		{/if}
	</p>

	{#if diagnostic}
		<details class="diagnostic">
			<summary>What Vault received from Firebase</summary>
			<pre>{diagnostic}</pre>
		</details>
	{/if}

	{#if settingsConsoleUrl}
		<a class="console-link" href={settingsConsoleUrl} target="_blank" rel="noopener noreferrer">
			Firebase Auth settings →
		</a>
	{/if}

	<p class="trust-note">
		Create one account per person, using the same email you put in the vault's member list.
		Use Vault only on a device you trust.
	</p>
</section>

<style>
	.card {
		width: min(100%, 31rem);
		padding: 32px 24px;
		border: 1px solid var(--border);
		border-radius: 28px;
		background: var(--surface);
		box-shadow: 0 24px 60px rgb(16 54 34 / 13%);
	}

	.mark {
		display: grid;
		width: 44px;
		height: 44px;
		place-items: center;
		margin-bottom: 22px;
		border-radius: 14px;
		background: linear-gradient(135deg, #138748, #075f31);
		color: white;
		font-size: 1.3rem;
		font-weight: 850;
	}

	.eyebrow {
		margin: 0 0 10px;
		color: var(--green);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.14em;
	}

	h1 {
		margin: 0;
		color: var(--text);
		font-size: clamp(2rem, 8vw, 2.6rem);
		line-height: 1.06;
		letter-spacing: -0.045em;
	}

	.intro {
		margin: 16px 0 24px;
		color: var(--muted);
		font-size: 1rem;
		line-height: 1.6;
	}

	form {
		display: grid;
		gap: 15px;
	}

	label {
		display: grid;
		gap: 7px;
		color: var(--text);
		font-size: 0.82rem;
		font-weight: 780;
	}

	input {
		width: 100%;
		min-height: 50px;
		border: 1px solid var(--border-strong);
		border-radius: 13px;
		background: var(--input);
		color: var(--text);
		font: inherit;
		font-size: 1rem;
		font-weight: 500;
		outline: none;
		padding: 0 13px;
	}

	input:focus {
		border-color: var(--green);
		box-shadow: 0 0 0 3px rgb(31 158 88 / 18%);
	}

	.primary {
		min-height: 52px;
		margin-top: 3px;
		border: 0;
		border-radius: 14px;
		background: linear-gradient(135deg, #118044, #086332);
		color: #fff;
		font: inherit;
		font-size: 1rem;
		font-weight: 800;
		cursor: pointer;
	}

	.primary:disabled,
	.text-button:disabled {
		cursor: wait;
		opacity: 0.66;
	}

	.primary:focus-visible,
	.text-button:focus-visible {
		outline: 3px solid rgb(31 158 88 / 36%);
		outline-offset: 3px;
	}

	.error {
		margin: 0;
		padding: 12px;
		border: 1px solid #f2b4b0;
		border-radius: 12px;
		background: #fff1f0;
		color: #aa2822;
		font-size: 0.88rem;
		line-height: 1.45;
	}

	.switch {
		margin: 18px 0 0;
		color: var(--muted);
		font-size: 0.85rem;
	}

	.text-button {
		border: 0;
		background: transparent;
		color: var(--green);
		font: inherit;
		font-size: 0.85rem;
		font-weight: 800;
		cursor: pointer;
		padding: 0;
	}

	.console-link {
		display: inline-block;
		margin-top: 12px;
		color: var(--green);
		font-size: 0.78rem;
		font-weight: 780;
		text-decoration: none;
	}

	.diagnostic {
		margin-top: 14px;
		color: var(--muted);
		font-size: 0.78rem;
		line-height: 1.5;
	}

	.diagnostic summary {
		cursor: pointer;
		font-weight: 700;
	}

	.diagnostic pre {
		margin: 8px 0 0;
		padding: 10px 11px;
		border: 1px solid var(--border);
		border-radius: 11px;
		background: var(--surface-hover);
		color: var(--text);
		font-size: 0.72rem;
		line-height: 1.5;
		overflow-x: auto;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.trust-note {
		margin: 20px 0 0;
		color: var(--muted);
		font-size: 0.78rem;
		line-height: 1.5;
	}

	@media (prefers-color-scheme: dark) {
		.card {
			box-shadow: 0 24px 60px rgb(0 0 0 / 32%);
		}

		.error {
			border-color: #75302e;
			background: #331b1a;
			color: #ffb8b2;
		}
	}
</style>
