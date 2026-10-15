<script lang="ts">
	interface Props {
		/** Amount already received, in paise. */
		value: number;
		/** The project's estimated price, in paise. */
		max: number;
		/** Spoken description, e.g. "₹45,000 of ₹60,000 received". */
		label: string;
	}

	let { value, max, label }: Props = $props();

	const percent = $derived(max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0);
	const over = $derived(max > 0 && value > max);
</script>

<div
	class="progress"
	class:progress--over={over}
	role="progressbar"
	aria-label={label}
	aria-valuemin={0}
	aria-valuemax={Math.max(1, max, value)}
	aria-valuenow={value}
	aria-valuetext={label}
>
	<span class="progress__fill" style={`width: ${percent}%`}></span>
</div>
