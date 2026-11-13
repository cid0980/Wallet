import { mount } from 'svelte';

import '../src/app.css';
import DemoApp from './DemoApp.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app');

mount(DemoApp, { target });
