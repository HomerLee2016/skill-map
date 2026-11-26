import { useWorkspace } from '../contexts/WorkspaceContext';

/** Shown when the browser has dropped access to the saved local folder (e.g. after a long idle or re-login). */
export function FolderReconnectBanner() {
  const { folderToReconnect, reconnectFolder } = useWorkspace();
  if (!folderToReconnect) return null;
  return (
    <div className="folder-reconnect-banner" role="alert">
      <span>The browser needs permission to open your folder “{folderToReconnect.name}” again. What you see below is not that workspace.</span>
      <button type="button" className="toolbar-btn toolbar-btn--primary" onClick={() => { void reconnectFolder(); }}>Reconnect folder</button>
    </div>
  );
}
