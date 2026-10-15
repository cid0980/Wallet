<script lang="ts">
	import ChipGroup from '../../src/lib/components/ui/ChipGroup.svelte';
	import { projectIdForClient, projectsForClient } from '../../src/lib/utils/project-picker';

	let tags = $state(['Office', 'Software']);
	let selectedTags = $state<string[]>([]);
	let clientId = $state('a');
	let projectId = $state('');
	const allProjects = [
		{ id: 'a-site', clientId: 'a', name: 'Site' },
		{ id: 'a-logo', clientId: 'a', name: 'Logo' },
		{ id: 'b-site', clientId: 'b', name: 'Site for B' }
	];
	const clientProjects = $derived(projectsForClient(allProjects, clientId));

	function toggleTag(tag: string): void {
		selectedTags = selectedTags.includes(tag)
			? selectedTags.filter((entry) => entry !== tag)
			: [...selectedTags, tag];
	}

	function chooseClient(value: string): void {
		clientId = value;
		projectId = projectIdForClient(allProjects, value, projectId);
	}
</script>

<button type="button" onclick={() => (tags = [...tags, 'Hosting'])}>Add Hosting tag</button>
<ChipGroup label="Spending tags" options={tags.map((tag) => ({ value: tag, label: tag }))} multiple values={selectedTags} maxSelected={3} onChange={toggleTag} />
<output id="tag-selection">{selectedTags.join(',')}</output>
<ChipGroup label="Client" options={[{ value: 'a', label: 'Client A' }, { value: 'b', label: 'Client B' }]} value={clientId} onChange={chooseClient} />
<ChipGroup label="Project" options={[{ value: '', label: 'No project' }, ...clientProjects.map((project) => ({ value: project.id, label: project.name }))]} value={projectId} onChange={(value) => (projectId = value)} />
<output id="project-selection">{projectId}</output>
