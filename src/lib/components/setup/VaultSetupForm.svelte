<script lang="ts">
	import type { User } from 'firebase/auth';

	import type { VaultSetupInput } from '$lib/types/vault';

	export let user: User;
	export let busy = false;
	export let error: string | null = null;
	export let onCreate: (input: VaultSetupInput) => Promise<void> | void;
	export let onSignOut: () => Promise<void> | void;

	let vaultName = 'Our Vault';
	let partnerAName = '';
	let partnerAEmail = '';
	let partnerBName = '';
	let partnerBEmail = '';
	let validationError = '';

	$: if (user.displayName && !partnerAName) {
		partnerAName = user.displayName;
	}

	$: if (user.email && !partnerAEmail) {
		partnerAEmail = user.email;
	}

	$: shownError = validationError || error;

	function handleSubmit(event: SubmitEvent): void {
		event.preventDefault();
		validationError = '';

		const ownEmail = user.email?.trim() ?? '';
		const input: VaultSetupInput = {
			name: vaultName.trim(),
			members: {
				a: {
					name: partnerAName.trim(),
					email: partnerAEmail.trim()
				},
				b: {
					name: partnerBName.trim(),
					email: partnerBEmail.trim()
				}
			}
		};

		if (!input.name || !input.members.a.name || !input.members.b.name) {
			validationError = 'Enter a vault name and both partner names.';
			return;
		}

		if (!input.members.a.email || !input.members.b.email) {
			validationError = 'Enter both Google email addresses.';
			return;
		}

		if (input.members.a.email.toLocaleLowerCase() === input.members.b.email.toLocaleLowerCase()) {
			validationError = 'Partner A and Partner B must have different Google emails.';
			return;
		}

		if (ownEmail !== input.members.a.email && ownEmail !== input.members.b.email) {
			validationError = 'Your signed-in Google email must be listed as Partner A or Partner B.';
			return;
		}

		void onCreate(input);
	}
</script>

<section aria-labelledby="setup-title" class="card">
	<header>
		<p class="eyebrow">FIRST-RUN SETUP</p>
		<h1 id="setup-title">Create the shared vault.</h1>
		<p class="intro">
			Only the two Google emails entered below will be allowed to access this vault once the final
			Firestore rules are deployed.
		</p>
	</header>

	<form onsubmit={handleSubmit}>
		<label>
			<span>Vault name</span>
			<input bind:value={vaultName} autocomplete="organization" maxlength="80" required disabled={busy} />
		</label>

		<fieldset>
			<legend>Partner A</legend>
			<label>
				<span>Name</span>
				<input bind:value={partnerAName} autocomplete="name" maxlength="80" required disabled={busy} />
			</label>
			<label>
				<span>Google email</span>
				<input
					bind:value={partnerAEmail}
					type="email"
					autocomplete="email"
					maxlength="320"
					required
					disabled={busy}
				/>
			</label>
		</fieldset>

		<fieldset>
			<legend>Partner B</legend>
			<label>
				<span>Name</span>
				<input bind:value={partnerBName} autocomplete="name" maxlength="80" required disabled={busy} />
			</label>
			<label>
				<span>Google email</span>
				<input
					bind:value={partnerBEmail}
					type="email"
					autocomplete="email"
					maxlength="320"
					required
					disabled={busy}
				/>
			</label>
		</fieldset>

		{#if shownError}
			<p class="error" role="alert">{shownError}</p>
		{/if}

		<button class="primary" type="submit" disabled={busy}>
			{busy ? 'Creating secure vault…' : 'Create shared vault'}
		</button>
	</form>

	<footer>
		<p>Signed in as <strong>{user.email}</strong></p>
		<button class="text-button" type="button" disabled={busy} onclick={() => void onSignOut()}>
			Use another Google account
		</button>
	</footer>
</section>

<style>
	.card {
		width: min(100%, 36rem);
		padding: 28px 20px;
		border: 1px solid var(--border);
		border-radius: 24px;
		background: var(--surface);
		box-shadow: 0 24px 60px rgb(16 54 34 / 13%);
	}

	.eyebrow {
		margin: 0 0 8px;
		color: var(--green);
		font-size: 0.71rem;
		font-weight: 800;
		letter-spacing: 0.13em;
	}

	h1 {
		margin: 0;
		color: var(--text);
		font-size: clamp(1.75rem, 7vw, 2.3rem);
		line-height: 1.1;
		letter-spacing: -0.04em;
	}

	.intro {
		margin: 12px 0 24px;
		color: var(--muted);
		font-size: 0.95rem;
		line-height: 1.55;
	}

	form {
		display: grid;
		gap: 18px;
	}

	fieldset {
		display: grid;
		gap: 14px;
		margin: 0;
		padding: 16px;
		border: 1px solid var(--border);
		border-radius: 16px;
	}

	legend {
		padding: 0 6px;
		color: var(--text);
		font-size: 0.86rem;
		font-weight: 780;
	}

	label {
		display: grid;
		gap: 7px;
		color: var(--text);
		font-size: 0.85rem;
		font-weight: 700;
	}

	input {
		width: 100%;
		min-height: 48px;
		border: 1px solid var(--border-strong);
		border-radius: 12px;
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

	footer {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-top: 22px;
		padding-top: 18px;
		border-top: 1px solid var(--border);
	}

	footer p {
		max-width: 13rem;
		margin: 0;
		color: var(--muted);
		font-size: 0.76rem;
		line-height: 1.45;
		word-break: break-word;
	}

	footer strong {
		color: var(--text);
	}

	.text-button {
		border: 0;
		background: transparent;
		color: var(--green);
		font: inherit;
		font-size: 0.82rem;
		font-weight: 780;
		cursor: pointer;
		padding: 0;
		text-align: right;
	}

	@media (min-width: 480px) {
		.card {
			padding: 32px;
		}
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
