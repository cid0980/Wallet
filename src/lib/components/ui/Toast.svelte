<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		tone: 'ok' | 'error';
		text: string;
		onDismiss: () => void;
	}

	let { tone, text, onDismiss }: Props = $props();
</script>

<!-- A live region: assistive technology announces the same confirmation the
     eye reads. Errors are assertive, successes polite. -->
<p
	class="toast"
	class:toast--ok={tone === 'ok'}
	class:toast--error={tone === 'error'}
	role={tone === 'error' ? 'alert' : 'status'}
	aria-live={tone === 'error' ? 'assertive' : 'polite'}
	aria-atomic="true"
>
	<span class="toast__icon" aria-hidden="true"><Icon name={tone === 'error' ? 'warning' : 'check'} size={18} /></span>
	<span class="toast__text">{text}</span>
	<button class="toast__close" type="button" aria-label="Dismiss message" onclick={onDismiss}>
		<Icon name="close" size={16} />
	</button>
</p>
