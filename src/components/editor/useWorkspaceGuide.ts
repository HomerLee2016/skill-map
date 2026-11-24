import { useMemo } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { resolveGuide } from '../../services/promptGuideChoice';
import { BUNDLED_GUIDES } from '../../services/promptGuides';

/** The prompt guide the editors show: this workspace's saved one, else the bundled guide for its language. */
export function useWorkspaceGuide() {
  const { workspace, workspaceSelectionLabel, saveGuide } = useWorkspace();
  const guide = useMemo(() => resolveGuide(workspaceSelectionLabel, workspace, BUNDLED_GUIDES), [workspaceSelectionLabel, workspace]);
  return { guide, saveGuide };
}
