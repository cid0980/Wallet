<script lang="ts">
	import Icon from './Icon.svelte';
	import type { IconName } from './icon-names';

	export interface ChipOption {
		value: string;
		label: string;
		/** Two-letter-ish badge shown inside the chip (partner initials). */
		initial?: string;
		icon?: IconName;
	}

	interface Props {
		/** Names the group for assistive technology, e.g. "Received by". */
		label: string;
		options: ChipOption[];
		/** Single choice behaves like a radio group: arrows move and select. */
		multiple?: boolean;
		value?: string;
		values?: string[];
		/** Disable unselected options when the maximum is reached. */
		maxSelected?: number;
		disabled?: boolean;
		/** Single: the newly chosen value. Multiple: the value that toggled. */
		onChange: (value: string) => void;
	}

	let { label, options, multiple = false, value = '', values = [], maxSelected = Infinity, disabled = false, onChange }: Props = $props();

	let buttons: (HTMLButtonElement | undefined)[] = $state([]);

	const selectedIndex = $derived(options.findIndex((option) => option.value === value));
	/** Keeps the group reachable by keyboard even before a choice exists. */
	const tabbableIndex = $derived(selectedIndex === -1 ? 0 : selectedIndex);

	function isOn(option: ChipOption): boolean {
		return multiple ? values.includes(option.value) : value === option.value;
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (multiple || disabled) {
			return;
		}

		const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];

		if (!keys.includes(event.key)) {
			return;
		}

		event.preventDefault();

		const from = selectedIndex === -1 ? 0 : selectedIndex;
		const last = options.length - 1;

		let next: number;

		if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
			next = from === last ? 0 : from + 1;
		} else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
			next = from === 0 ? last : from - 1;
		} else if (event.key === 'Home') {
			next = 0;
		} else {
			next = last;
		}

		onChange(options[next].value);
		buttons[next]?.focus();
	}
</script>

<div
	class="chips"
	role={multiple ? 'group' : 'radiogroup'}
	aria-label={label}
	aria-orientation="horizontal"
	onkeydown={handleKeydown}
>
	{#each options as option, index (option.value)}
		{#if multiple}
			<label class="chip chip--choice" class:chip--on={isOn(option)} class:chip--unavailable={disabled || (values.length >= maxSelected && !isOn(option))}>
				<input
					type="checkbox"
					checked={isOn(option)}
					disabled={disabled || (values.length >= maxSelected && !isOn(option))}
					onchange={() => onChange(option.value)}
				/>
				{#if option.initial}<span class="chip__dot" aria-hidden="true">{option.initial}</span>{/if}
				{#if option.icon}<Icon name={option.icon} size={16} />{/if}
				{option.label}
			</label>
		{:else}
			<button
				class="chip"
				class:chip--on={isOn(option)}
				type="button"
				role="radio"
				aria-checked={isOn(option)}
				tabindex={index === tabbableIndex ? 0 : -1}
				disabled={disabled}
				bind:this={buttons[index]}
				onclick={() => onChange(option.value)}
			>
				{#if option.initial}<span class="chip__dot" aria-hidden="true">{option.initial}</span>{/if}
				{#if option.icon}<Icon name={option.icon} size={16} />{/if}
				{option.label}
			</button>
		{/if}
	{/each}
</div>
