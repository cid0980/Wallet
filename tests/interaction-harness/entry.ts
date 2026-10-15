import { mount, tick, unmount } from 'svelte';
import PickerHarness from './PickerHarness.svelte';

export function start(target: HTMLElement) {
	const app = mount(PickerHarness, { target });
	return { tick, stop: () => unmount(app) };
}
