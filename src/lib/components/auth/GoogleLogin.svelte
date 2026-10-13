<script lang="ts">
	export let busy = false;
	export let error: string | null = null;
	export let onSignIn: () => Promise<void> | void;
</script>

<section aria-labelledby="login-title" class="card">
	<div class="mark" aria-hidden="true">V</div>
	<p class="eyebrow">VAULT</p>
	<h1 id="login-title">One shared place for project money.</h1>
	<p class="intro">
		Track client payments, tagged spending, and the live balance you share with your partner.
	</p>

	<button class="google-button" type="button" disabled={busy} onclick={() => void onSignIn()}>
		<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
			<path
				fill="#4285F4"
				d="M21.35 12.22c0-.71-.06-1.39-.18-2.05H12v3.88h5.24a4.48 4.48 0 0 1-1.94 2.94v2.52h3.15c1.84-1.69 2.9-4.18 2.9-7.29Z"
			/>
			<path
				fill="#34A853"
				d="M12 21.72c2.62 0 4.82-.87 6.43-2.36l-3.15-2.52c-.87.58-1.99.93-3.28.93-2.53 0-4.68-1.71-5.45-4.01H3.3v2.59A9.72 9.72 0 0 0 12 21.72Z"
			/>
			<path
				fill="#FBBC05"
				d="M6.55 13.76A5.85 5.85 0 0 1 6.24 12c0-.61.11-1.2.31-1.76V7.65H3.3A9.72 9.72 0 0 0 2.28 12c0 1.57.38 3.06 1.02 4.35l3.25-2.59Z"
			/>
			<path
				fill="#EA4335"
				d="M12 6.23c1.43 0 2.72.49 3.73 1.45l2.8-2.8C16.82 3.29 14.62 2.28 12 2.28A9.72 9.72 0 0 0 3.3 7.65l3.25 2.59C7.32 7.94 9.47 6.23 12 6.23Z"
			/>
		</svg>
		{busy ? 'Opening Google…' : 'Continue with Google'}
	</button>

	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}

	<p class="trust-note">
		Use Vault only on a device you trust. Your signed-in session and selected Vault data can remain
		cached on this device for offline use.
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
		font-size: clamp(2rem, 8vw, 2.75rem);
		line-height: 1.06;
		letter-spacing: -0.045em;
	}

	.intro {
		margin: 16px 0 26px;
		color: var(--muted);
		font-size: 1rem;
		line-height: 1.6;
	}

	.google-button {
		display: flex;
		width: 100%;
		min-height: 52px;
		align-items: center;
		justify-content: center;
		gap: 12px;
		border: 1px solid var(--border-strong);
		border-radius: 14px;
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-weight: 750;
		cursor: pointer;
		transition:
			transform 150ms ease,
			box-shadow 150ms ease,
			background 150ms ease;
	}

	.google-button:hover:not(:disabled) {
		background: var(--surface-hover);
		box-shadow: 0 8px 18px rgb(16 54 34 / 12%);
		transform: translateY(-1px);
	}

	.google-button:focus-visible {
		outline: 3px solid rgb(31 158 88 / 36%);
		outline-offset: 3px;
	}

	.google-button:disabled {
		cursor: wait;
		opacity: 0.66;
	}

	svg {
		width: 20px;
		height: 20px;
	}

	.error {
		margin: 16px 0 0;
		padding: 12px;
		border: 1px solid #f2b4b0;
		border-radius: 12px;
		background: #fff1f0;
		color: #aa2822;
		font-size: 0.9rem;
		line-height: 1.45;
	}

	.trust-note {
		margin: 22px 0 0;
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
