export interface WorkspaceTriggerClickHandlers {
  toggleMenu: () => void;
  refreshWorkspaceHistoryCounts: () => Promise<void>;
}

export async function handleWorkspaceTriggerClick({ toggleMenu, refreshWorkspaceHistoryCounts }: WorkspaceTriggerClickHandlers) {
  toggleMenu();
  await refreshWorkspaceHistoryCounts();
}
