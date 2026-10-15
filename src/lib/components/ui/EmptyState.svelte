<script lang="ts">
	import type { Snippet } from 'svelte';

	import Icon from './Icon.svelte';
	import type { IconName } from './icon-names';

	interface Props {
		icon: IconName;
		title: string;
		message?: string;
		/** Icon name for the title's heading level is fixed at h3 by design. */
		children?: Snippet;
	}

	let { icon, title, message = '', children }: Props = $props();
</script>

<div class="empty">
	<span class="empty__icon" aria-hidden="true"><Icon name={icon} size={22} /></span>
	<h3 class="h3">{title}</h3>
	{#if message}<p>{message}</p>{/if}
	{#if children}{@render children()}{/if}
</div>
