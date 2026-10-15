import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Import the browser bundle only after DOM globals exist. This tests actual
// Svelte event/hydration-style updates, not merely string render output.
const dom = new JSDOM('<!doctype html><html><body><main id="test"></main></body></html>', {
	url: 'https://vault.test',
	pretendToBeVisual: true
});

for (const name of ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'Node', 'Text', 'Comment', 'Document', 'Event', 'CustomEvent', 'MutationObserver', 'getComputedStyle']) {
	Object.defineProperty(globalThis, name, {
		configurable: true,
		value: name === 'getComputedStyle' ? dom.window.getComputedStyle.bind(dom.window) : dom.window[name]
	});
}

const { start } = await import('./out/entry.js');
const root = document.getElementById('test');
const { tick, stop } = start(root);
await tick();

const group = (name) => root.querySelector(`[aria-label="${name}"]`);
const option = (name, text) => [...group(name).querySelectorAll('button, label')].find((element) => element.textContent.trim() === text);
const selectedTags = () => root.querySelector('#tag-selection').textContent;
const selectedProject = () => root.querySelector('#project-selection').textContent;

// A freshly added shared tag must select on its FIRST click, remain selected
// when another tag is chosen, and unselect on one click as well.
option('Spending tags', 'Office').click();
await tick();
assert.equal(selectedTags(), 'Office');
root.querySelector('button').click();
await tick();
const hosting = option('Spending tags', 'Hosting');
assert.ok(hosting, 'new tag appears without reopening the sheet');
hosting.click();
await tick();
assert.equal(selectedTags(), 'Office,Hosting');
assert.equal(hosting.querySelector('input').checked, true);
hosting.click();
await tick();
assert.equal(selectedTags(), 'Office');
assert.equal(hosting.querySelector('input').checked, false);

// Client A sees only A projects. Choosing B swaps options and resets A's
// selected project; selecting B never changes the client behind the scenes.
assert.ok(option('Project', 'Site'));
assert.ok(option('Project', 'Logo'));
assert.equal(option('Project', 'Site for B'), undefined);
option('Project', 'Site').click();
await tick();
assert.equal(selectedProject(), 'a-site');
option('Client', 'Client B').click();
await tick();
assert.equal(selectedProject(), '');
assert.equal(option('Project', 'Site'), undefined);
assert.equal(option('Project', 'Logo'), undefined);
assert.ok(option('Project', 'Site for B'));
option('Project', 'Site for B').click();
await tick();
assert.equal(selectedProject(), 'b-site');

await stop();
dom.window.close();
console.log('Picker interactions: newly added tag selects in one click; projects follow the selected client.');
