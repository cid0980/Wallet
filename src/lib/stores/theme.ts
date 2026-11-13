/**
 * Theme for this device.
 *
 * 'auto' follows the phone; 'light' and 'dark' pin the choice. It is stored per
 * device on purpose — the vault itself stays theme-free, so two people can read
 * the same records on differently-lit phones.
 *
 * The choice is painted onto <html data-theme> and onto the status bar through
 * the theme-color meta. The navigation bar is a separate story: Android bakes it
 * from the manifest at install time and never reads it again, so it is pinned to
 * one dark value for everybody — see static/manifest.webmanifest.
 */
import { get, writable } from 'svelte/store';

export type ThemePref = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_KEY = 'vault.theme';

/**
 * A fresh install starts light. 'Auto' is still offered in Settings, but the
 * default is a deliberate choice: the app should look the same the first time
 * two people open it, whatever their phones are set to.
 */
export const DEFAULT_THEME: ThemePref = 'light';

/**
 * The status-bar colour for each theme. It is the page background, never the
 * brand blue, so the status bar reads as part of the screen.
 *
 * This only reaches the status bar: inside an installed app Android paints the
 * navigation bar from the manifest, which it reads once at install time, so that
 * one is pinned to a single dark value rather than chasing the theme.
 */
const CHROME: Record<ResolvedTheme, string> = {
	light: '#f8fafc',
	dark: '#0b1220'
};

export function chromeColor(theme: ResolvedTheme): string {
	return CHROME[theme];
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemQuery(): MediaQueryList | null {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
	return window.matchMedia(DARK_QUERY);
}

function readStored(): ThemePref {
	if (typeof window === 'undefined') return DEFAULT_THEME;
	try {
		const value = window.localStorage.getItem(THEME_KEY);
		return isThemePref(value) ? value : DEFAULT_THEME;
	} catch {
		return DEFAULT_THEME;
	}
}

export function isThemePref(value: unknown): value is ThemePref {
	return value === 'auto' || value === 'light' || value === 'dark';
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
	if (pref === 'light' || pref === 'dark') return pref;
	return systemQuery()?.matches ? 'dark' : 'light';
}

/** Put the resolved theme on the document and on the system bars. */
function paint(pref: ThemePref): ResolvedTheme {
	const resolved = resolveTheme(pref);
	if (typeof document === 'undefined') return resolved;
	const root = document.documentElement;
	root.dataset.theme = resolved;
	root.style.colorScheme = resolved;
	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) meta.setAttribute('content', chromeColor(resolved));
	return resolved;
}

export const themePref = writable<ThemePref>(readStored());
export const resolvedTheme = writable<ResolvedTheme>('light');

if (typeof window !== 'undefined') {
	themePref.subscribe((pref) => {
		resolvedTheme.set(paint(pref));
		try {
			window.localStorage.setItem(THEME_KEY, pref);
		} catch {
			/* Private mode: the choice simply won't survive a reload. */
		}
	});
	// 'auto' has to follow the phone while the app is open, not only at boot.
	systemQuery()?.addEventListener('change', () => paint(get(themePref)));
}

export function setThemePref(pref: ThemePref): void {
	themePref.set(pref);
}
