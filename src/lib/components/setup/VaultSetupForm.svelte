<script lang="ts">
	import type { User } from 'firebase/auth';

	import Icon from '$lib/components/ui/Icon.svelte';
	import type { VaultSetupInput } from '$lib/types/vault';

	export let user: User;
	export let busy = false;
	export let error: string | null = null;
	export let onCreate: (input: VaultSetupInput) => Promise<void> | void;
	export let onSignOut: () => Promise<void> | void;

	let vaultName = 'Our Vault';
	let yourName = '';
	let yourEmail = '';
	let partnerName = '';
	let partnerEmail = '';
	let validationError = '';

	$: if (user.email && !yourEmail) {
		yourEmail = user.email;
	}

	$: shownError = validationError || error;

	function handleSubmit(event: SubmitEvent): void {
		event.preventDefault();
		validationError = '';

		const ownEmail = user.email?.trim() ?? '';
		const input: VaultSetupInput = {
			name: vaultName.trim(),
			members: {
				a: { name: yourName.trim(), email: yourEmail.trim() },
				b: { name: partnerName.trim(), email: partnerEmail.trim() }
			}
		};

		if (!input.name || !input.members.a.name || !input.members.b.name) {
			validationError = 'Fill in the vault name and both names.';
			return;
		}

		if (!input.members.a.email.includes('@') || !input.members.b.email.includes('@')) {
			validationError = 'Fill in both email addresses.';
			return;
		}

		if (input.members.a.email.toLowerCase() === input.members.b.email.toLowerCase()) {
			validationError = 'The two email addresses must be different.';
			return;
		}

		const ownsPartner = [input.members.a.email, input.members.b.email].some(
			(email) => email.toLowerCase() === ownEmail.toLowerCase()
		);

		if (!ownsPartner) {
			validationError = 'Include the email you are signed in with, so the vault recognises you.';
			return;
		}

		void onCreate(input);
	}
</script>

<section class="card card--pad setup" aria-labelledby="setup-title">
	<p class="eyebrow">First run</p>
	<h1 class="h1 mt-10" id="setup-title">Create the shared vault.</h1>
	<p class="lead mt-10">
		Name your vault and add both of you. Only these two accounts can open it afterwards, so type the email
		addresses exactly as you signed up.
	</p>

	<form class="form mt-14" onsubmit={handleSubmit}>
		<label class="field">
			<span class="field__label">Vault name</span>
			<input class="input" bind:value={vaultName} maxlength="80" placeholder="Our Vault" required disabled={busy} />
		</label>

		<div class="pair">
			<p class="pair__title"><span class="pair__badge" aria-hidden="true">1</span>You</p>
			<label class="field">
				<span class="field__label">Your name</span>
				<input class="input" bind:value={yourName} autocomplete="name" maxlength="80" placeholder="Your name" required disabled={busy} />
			</label>
			<label class="field">
				<span class="field__label">Your email</span>
				<input
					class="input"
					bind:value={yourEmail}
					type="email"
					autocomplete="email"
					inputmode="email"
					autocapitalize="none"
					spellcheck="false"
					maxlength="320"
					required
					disabled={busy}
				/>
			</label>
			{#if user.email && yourEmail.toLowerCase() !== user.email.toLowerCase()}
				<p class="notice notice--warn">
					You are signed in as <strong>{user.email}</strong>. Keep that address here, or the vault will not
					recognise you.
				</p>
			{/if}
		</div>

		<div class="pair">
			<p class="pair__title"><span class="pair__badge" aria-hidden="true">2</span>Your partner</p>
			<label class="field">
				<span class="field__label">Partner name</span>
				<input class="input" bind:value={partnerName} autocomplete="name" maxlength="80" placeholder="Their name" required disabled={busy} />
			</label>
			<label class="field">
				<span class="field__label">Partner email</span>
				<input
					class="input"
					bind:value={partnerEmail}
					type="email"
					autocomplete="email"
					inputmode="email"
					autocapitalize="none"
					spellcheck="false"
					maxlength="320"
					placeholder="partner@example.com"
					required
					disabled={busy}
				/>
			</label>
		</div>

		{#if shownError}
			<p class="notice notice--error" role="alert">{shownError}</p>
		{/if}

		<button class="btn btn--primary btn--block" type="submit" disabled={busy}>
			{busy ? 'Creating your vault…' : 'Create shared vault'}
		</button>
	</form>

	<footer class="setup__foot">
		<p class="tiny">
			Your partner can join as soon as they create their own account with the email above. Signed in as
			<strong>{user.email}</strong>.
		</p>
		<button class="btn btn--outline btn--sm" type="button" disabled={busy} onclick={() => void onSignOut()}>
			<Icon name="sign-out" size={16} /> Use another account
		</button>
	</footer>
</section>
