<script lang="ts">
	interface Props {
		rows?: number;
		/** Announced to assistive technology while the shapes stand in. */
		label: string;
	}

	let { rows = 3, label }: Props = $props();
</script>

<!-- Skeleton rows keep the page's rhythm while records load, so the layout
     does not jump. The shapes are decorative; the sentence is what is read. -->
<div class="skeletons">
	<p class="sr-only" aria-live="polite">{label}</p>
	{#each Array.from({ length: rows }) as _, index (index)}
		<div class="skeleton-row" aria-hidden="true">
			<span class="skeleton skeleton--badge"></span>
			<span class="skeleton-body">
				<span class="skeleton skeleton--line" style="width: 46%"></span>
				<span class="skeleton skeleton--line skeleton--soft" style="width: 68%"></span>
			</span>
			<span class="skeleton skeleton--amount"></span>
		</div>
	{/each}
</div>
