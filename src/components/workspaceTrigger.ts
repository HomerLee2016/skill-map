export interface WorkspaceTriggerClickHandlers {
  toggleMenu: () => void;
  refreshWorkspace: () => Promise<void>;
}

export async function handleWorkspaceTriggerClick({ toggleMenu, refreshWorkspace }: WorkspaceTriggerClickHandlers) {
  toggleMenu();
  await refreshWorkspace();
}
