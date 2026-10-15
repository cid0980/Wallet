<script lang="ts">
	/**
	 * Inline icon set.
	 *
	 * Icons are drawn here rather than taken from an icon font or a text
	 * glyph: symbol fonts (⌂ ◎ ↗) render at different weights and sizes on
	 * each operating system, so the same screen looked different on two
	 * phones. These paths are the same pixels everywhere.
	 */
	type IconName =
		| 'home'
		| 'clients'
		| 'money-in'
		| 'money-out'
		| 'more'
		| 'plus'
		| 'close'
		| 'search'
		| 'check'
		| 'check-circle'
		| 'vault'
		| 'sign-out'
		| 'warning'
		| 'refresh'
		| 'history'
		| 'calendar'
		| 'tag'
		| 'target'
		| 'pencil'
		| 'trash'
		| 'chevron-right'
		| 'arrow-right'
		| 'inbox'
		| 'info'
		| 'copy'
		| 'external';

	export let name: IconName;
	export let size = 20;
	export let stroke = 1.8;

	const paths: Record<IconName, string[]> = {
		home: ['M4.5 11 12 4.6 19.5 11', 'M6.6 9.9V19.4h10.8V9.9', 'M10.2 19.4v-5h3.6v5'],
		clients: [
			'M9.4 11.4a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6',
			'M4 19.4v-1.5a3.6 3.6 0 0 1 3.6-3.6h3.6a3.6 3.6 0 0 1 3.6 3.6v1.5',
			'M16.4 5.6a3 3 0 0 1 0 5.6',
			'M20 19.4v-1.4a3.2 3.2 0 0 0-2.4-3.1'
		],
		'money-in': ['M18 6 7 17', 'M7 10.4V17h6.6'],
		'money-out': ['M6 18 17 7', 'M17 13.6V7H10.4'],
		more: ['M6.4 12h.01', 'M12 12h.01', 'M17.6 12h.01'],
		plus: ['M12 5.6v12.8', 'M5.6 12h12.8'],
		close: ['M7 7l10 10', 'M17 7 7 17'],
		search: ['M11 4.8a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4', 'M15.6 15.6 20 20'],
		check: ['M5.5 12.6 10 17l8.5-9.2'],
		'check-circle': ['M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14', 'M9 12.2 11.3 14.5 15.4 10'],
		vault: [
			'M4 8.6A2.6 2.6 0 0 1 6.6 6H18a2 2 0 0 1 2 2v8.4a2 2 0 0 1-2 2H6.6A2.6 2.6 0 0 1 4 15.8V8.6Z',
			'M4 9.6h13.6',
			'M16.6 13.6h.01'
		],
		'sign-out': [
			'M14.6 5.6H7.8A2.4 2.4 0 0 0 5.4 8v8a2.4 2.4 0 0 0 2.4 2.4h6.8',
			'M12.6 12h7.6',
			'M17.2 8.9 20.3 12l-3.1 3.1'
		],
		warning: ['M12 4.6 3.8 19h16.4L12 4.6Z', 'M12 10.2v3.9', 'M12 16.8h.01'],
		refresh: ['M19 12a7 7 0 1 1-2.3-5.2', 'M19 4.8V9.3h-4.5'],
		history: ['M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14', 'M12 8.4V12l2.7 1.8'],
		calendar: [
			'M5.6 7.6a2 2 0 0 1 2-2h8.8a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2H7.6a2 2 0 0 1-2-2V7.6Z',
			'M5.9 10.2h12.2',
			'M9.2 4.2v3.2',
			'M14.8 4.2v3.2'
		],
		tag: ['M5.6 11.4V6.6a1 1 0 0 1 1-1h4.8l6.8 6.8-5.8 5.8-6.8-6.8Z', 'M9 9h.01'],
		target: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17', 'M12 7.8a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4', 'M12 11.6h.01'],
		pencil: ['M5 19h3.4L19 8.4a1.9 1.9 0 0 0-2.7-2.7L5.7 16.3 5 19Z'],
		trash: [
			'M5.6 8h12.8',
			'M9.2 8V6.3A1.3 1.3 0 0 1 10.5 5h3A1.3 1.3 0 0 1 14.8 6.3V8',
			'M7.3 8l.7 9.9a1.5 1.5 0 0 0 1.5 1.4h5a1.5 1.5 0 0 0 1.5-1.4L17 8'
		],
		'chevron-right': ['M10 8l4 4-4 4'],
		'arrow-right': ['M5 12h13', 'M13.6 7.8 18 12l-4.4 4.2'],
		inbox: [
			'M4.6 12.6 7 6.6h10l2.4 6v4.4a1.6 1.6 0 0 1-1.6 1.6H6.2a1.6 1.6 0 0 1-1.6-1.6v-4.4Z',
			'M4.9 12.6h4.1l.9 2h4.2l.9-2h4.1'
		],
		info: ['M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14', 'M12 11.2v4.6', 'M12 8.4h.01'],
		copy: [
			'M9.2 9V7.6A1.6 1.6 0 0 1 10.8 6h5.6A1.6 1.6 0 0 1 18 7.6v5.6a1.6 1.6 0 0 1-1.6 1.6H15',
			'M6.2 9.6A1.6 1.6 0 0 1 7.8 8h5.6a1.6 1.6 0 0 1 1.6 1.6v5.6a1.6 1.6 0 0 1-1.6 1.6H7.8a1.6 1.6 0 0 1-1.6-1.6V9.6Z'
		],
		external: ['M14 5.6h4.4V10', 'M18.2 5.8 11 13', 'M17 14v3.4a1.6 1.6 0 0 1-1.6 1.6H6.8a1.6 1.6 0 0 1-1.6-1.6V8.6A1.6 1.6 0 0 1 6.8 7H10']
};
</script>

<svg
	viewBox="0 0 24 24"
	width={size}
	height={size}
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
>
	{#each paths[name] as d}
		<path {d} />
	{/each}
</svg>
