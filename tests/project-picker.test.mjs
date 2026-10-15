import { test } from 'node:test';
import assert from 'node:assert/strict';

import { projectIdForClient, projectsForClient } from '../src/lib/utils/project-picker.ts';

const projects = [
	{ id: 'a-site', clientId: 'client-a' },
	{ id: 'b-app', clientId: 'client-b' },
	{ id: 'a-logo', clientId: 'client-a' }
];

test('the payment picker only shows the selected client’s projects', () => {
	assert.deepEqual(projectsForClient(projects, 'client-a').map((project) => project.id), ['a-site', 'a-logo']);
	assert.deepEqual(projectsForClient(projects, 'client-b').map((project) => project.id), ['b-app']);
	assert.deepEqual(projectsForClient(projects, 'client-without-projects'), []);
});

test('switching clients clears a project belonging to another client', () => {
	assert.equal(projectIdForClient(projects, 'client-a', 'a-site'), 'a-site');
	assert.equal(projectIdForClient(projects, 'client-b', 'a-site'), '');
	assert.equal(projectIdForClient(projects, 'client-a', ''), '');
});
