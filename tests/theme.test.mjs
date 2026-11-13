import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_THEME, THEME_KEY, chromeColor, isThemePref, resolveTheme } from '../src/lib/stores/theme.ts';

test('the storage key stays put, so a choice survives a deploy', () => {
	assert.equal(THEME_KEY, 'vault.theme');
});

test('a pinned choice always wins over the phone', () => {
	assert.equal(resolveTheme('light'), 'light');
	assert.equal(resolveTheme('dark'), 'dark');
});

test('auto resolves without a browser, so server rendering stays light', () => {
	assert.equal(resolveTheme('auto'), 'light');
});

test('only the three known values are accepted from storage', () => {
	assert.equal(isThemePref('light'), true);
	assert.equal(isThemePref('dark'), true);
	assert.equal(isThemePref('auto'), true);
	assert.equal(isThemePref('DARK'), false);
	assert.equal(isThemePref(''), false);
	assert.equal(isThemePref(null), false);
	assert.equal(isThemePref(undefined), false);
});

test('the status bar takes the page background, never the brand blue', () => {
	assert.equal(chromeColor('light'), '#f8fafc');
	assert.equal(chromeColor('dark'), '#0b1220');
	assert.ok(![chromeColor('light'), chromeColor('dark')].includes('#0d9488'));
});

test('a fresh install starts light rather than following the phone', () => {
	assert.equal(DEFAULT_THEME, 'light');
	assert.equal(resolveTheme(DEFAULT_THEME), 'light');
});
