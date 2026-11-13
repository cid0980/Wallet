<script lang="ts">
	import Icon from './Icon.svelte';
	import { formatPaise } from '$lib/utils/money';
	import { rangeLabel, type RangePreset } from '$lib/utils/tag-filter';

	interface TagFilterShape {
		tag: string | null;
		preset: RangePreset;
		from: string;
		to: string;
	}

	interface SummaryShape {
		totalPaise: number;
		count: number;
		aPaise: number;
		bPaise: number;
	}

	interface Props {
		/** Accessible name for the filter region. */
		label: string;
		/** Tags this ledger actually carries, ready to tap. */
		tags: string[];
		filter: TagFilterShape;
		summary: SummaryShape;
		partnerAName: string;
		partnerBName: string;
		/** "payment" / "expense", singular, for the count line. */
		unitLabel: string;
		presets: { value: RangePreset; label: string }[];
		/** Money out is described as spent; money in as received. */
		totalLabel: string;
		disabled?: boolean;
		onTag: (tag: string | null) => void;
		onPreset: (preset: RangePreset) => void;
		onBound: (bound: 'from' | 'to', value: string) => void;
		onReset: () => void;
	}

	let {
		label,
		tags,
		filter,
		summary,
		partnerAName,
		partnerBName,
		unitLabel,
		presets,
		totalLabel,
		disabled = false,
		onTag,
		onPreset,
		onBound,
		onReset
	}: Props = $props();

	const isFiltered = $derived(filter.tag !== null || filter.preset !== 'month');
	const countLabel = $derived(`${summary.count} ${unitLabel}${summary.count === 1 ? '' : 's'}`);
</script>

<section class="tag-filter" aria-label={label}>
	<div class="tag-filter__head">
		<p class="eyebrow">{label}</p>
		{#if isFiltered}
			<button class="btn btn--quiet btn--sm" type="button" {disabled} onclick={onReset}>Reset</button>
		{/if}
	</div>

	{#if tags.length}
		<div class="chips" role="group" aria-label="Filter by tag">
			<button
				class="chip"
				class:chip--on={filter.tag === null}
				type="button"
				aria-pressed={filter.tag === null}
				{disabled}
				onclick={() => onTag(null)}
			>
				All tags
			</button>
			{#each tags as tag (tag)}
				<button
					class="chip chip--tag"
					class:chip--on={filter.tag === tag}
					type="button"
					aria-pressed={filter.tag === tag}
					{disabled}
					onclick={() => onTag(tag)}
				>
					<Icon name="tag" size={14} /> {tag}
				</button>
			{/each}
		</div>
	{:else}
		<p class="hint">No tags yet — add one while recording, and it appears here.</p>
	{/if}

	<div class="chips" role="group" aria-label="Filter by date">
		{#each presets as preset (preset.value)}
			<button
				class="chip chip--soft"
				class:chip--on={filter.preset === preset.value}
				type="button"
				aria-pressed={filter.preset === preset.value}
				{disabled}
				onclick={() => onPreset(preset.value)}
			>
				{preset.label}
			</button>
		{/each}
	</div>

	{#if filter.preset === 'custom'}
		<div class="range-inputs">
			<label class="range-inputs__field">
				<span class="range-inputs__label">From</span>
				<input
					class="input"
					type="date"
					value={filter.from}
					aria-label="Show records from this date"
					{disabled}
					onchange={(event) => onBound('from', event.currentTarget.value)}
				/>
			</label>
			<label class="range-inputs__field">
				<span class="range-inputs__label">To</span>
				<input
					class="input"
					type="date"
					value={filter.to}
					aria-label="Show records up to this date"
					{disabled}
					onchange={(event) => onBound('to', event.currentTarget.value)}
				/>
			</label>
		</div>
	{/if}

	<div class="tag-sum" aria-live="polite">
		<p class="tag-sum__label">
			{totalLabel}
			{filter.tag ? `tagged ${filter.tag}` : 'in this range'}
		</p>
		<p class="tag-sum__total num">{formatPaise(summary.totalPaise)}</p>
		<p class="tag-sum__meta">
			{countLabel} · {rangeLabel({ from: filter.from, to: filter.to })}
		</p>
		<div class="tag-sum__split">
			<span><span class="dot--a" aria-hidden="true"></span>{partnerAName} <strong class="num">{formatPaise(summary.aPaise)}</strong></span>
			<span><span class="dot--b" aria-hidden="true"></span>{partnerBName} <strong class="num">{formatPaise(summary.bPaise)}</strong></span>
		</div>
	</div>
</section>

<style>
	.tag-filter {
		display: grid;
		gap: 10px;
		margin-top: 16px;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: var(--r-lg);
		background: var(--surface);
		box-shadow: var(--sh-1);
	}

	.tag-filter__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.tag-filter .chips {
		margin: 0;
	}

	.range-inputs {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}

	.range-inputs__field {
		display: grid;
		gap: 4px;
	}

	.range-inputs__label {
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ink-3);
	}

	.tag-sum {
		display: grid;
		gap: 2px;
		padding-top: 10px;
		border-top: 1px dashed var(--line);
	}

	.tag-sum__label {
		margin: 0;
		font-size: 0.78rem;
		letter-spacing: 0.02em;
		color: var(--ink-3);
	}

	.tag-sum__total {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--ink-2);
	}

	.tag-sum__meta {
		margin: 0;
		font-size: 0.82rem;
		color: var(--ink-3);
	}

	.tag-sum__split {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 16px;
		margin-top: 4px;
		font-size: 0.82rem;
		color: var(--ink-3);
	}

	.tag-sum__split strong {
		color: var(--ink-2);
		font-weight: 600;
	}

	.dot--a,
	.dot--b {
		display: inline-block;
		width: 8px;
		height: 8px;
		margin-right: 6px;
		border-radius: 50%;
		background: var(--brand);
	}

	/* Date presets read as a secondary control next to the tag chips. */
	.chip--soft {
		background: var(--surface-3);
		color: var(--ink-2);
	}

	.dot--b {
		background: var(--out);
	}
</style>
