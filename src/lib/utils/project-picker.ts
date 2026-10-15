import type { ProjectRecord } from '../types/vault';

/** Keep the payment picker scoped to the selected client, not the vault. */
export function projectsForClient<T extends Pick<ProjectRecord, 'id' | 'clientId'>>(
	projects: readonly T[],
	clientId: string
): T[] {
	return projects.filter((project) => project.clientId === clientId);
}

/** Changing clients must never keep a different client's project selected. */
export function projectIdForClient<T extends Pick<ProjectRecord, 'id' | 'clientId'>>(
	projects: readonly T[],
	clientId: string,
	projectId: string
): string {
	return projectsForClient(projects, clientId).some((project) => project.id === projectId) ? projectId : '';
}
