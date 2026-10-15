<script lang="ts">
	import type { Snippet } from 'svelte';

	import Icon from './Icon.svelte';

	interface Props {
		/** Accessible name for the modal, rendered as its visible title. */
		title: string;
		eyebrow?: string;
		/** `dialog` centres a compact confirmation; `sheet` rises from the bottom. */
		variant?: 'sheet' | 'dialog';
		closeLabel?: string;
		/** True while a submit is in flight: the close control is disabled. */
		busy?: boolean;
		onClose: () => void;
		children: Snippet;
	}

	let {
		title,
		eyebrow = '',
		variant = 'sheet',
		closeLabel = 'Close',
		busy = false,
		onClose,
		children
	}: Props = $props();

	let dialogEl = $state<HTMLDialogElement>();
	const titleId = $props.id();

	/**
	 * `showModal()` puts the dialog in the browser's top layer: focus is trapped
	 * inside it, the rest of the page becomes inert for assistive technology, and
	 * Escape and focus restoration are handled natively. The attribute fallback
	 * keeps the sheet usable if showModal is unavailable.
	 */
	$effect(() => {
		const element = dialogEl;

		if (!element || element.open) {
			return;
		}

		try {
			element.showModal();
		} catch {
			element.setAttribute('open', '');
		}
	});

	function requestClose(): void {
		if (busy) {
			return;
		}

		if (dialogEl?.open) {
			// Closing rather than unmounting lets the browser restore focus to
			// whatever opened the sheet.
			dialogEl.close();
			return;
		}

		onClose();
	}

	function handleClick(event: MouseEvent): void {
		// Clicks on the ::backdrop target the dialog element itself.
		if (event.target === dialogEl) {
			requestClose();
		}
	}
</script>

<dialog
	bind:this={dialogEl}
	class="sheet"
	class:sheet--dialog={variant === 'dialog'}
	aria-labelledby={titleId}
	onclose={onClose}
	oncancel={(event) => {
		event.preventDefault();
		requestClose();
	}}
	onclick={handleClick}
>
	<header class="sheet__head">
		<div>
			{#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
			<h2 class="h2" id={titleId}>{title}</h2>
		</div>
		{#if variant === 'sheet'}
			<button class="icon-btn" type="button" aria-label={closeLabel} disabled={busy} onclick={requestClose}>
				<Icon name="close" size={20} />
			</button>
		{/if}
	</header>
	<div class="sheet__body">
		{@render children()}
	</div>
</dialog>
