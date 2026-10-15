/**
 * The single source of truth for icon names. Kept out of Icon.svelte so other
 * components (chip groups, empty states, sheets) can take an icon name as a
 * typed prop.
 */
export type IconName =
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
