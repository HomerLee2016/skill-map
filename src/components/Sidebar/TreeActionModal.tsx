import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';

export interface TreeActionModalProps {
  isOpen: boolean;
  mode: 'add-folder' | 'assign-item';
  itemLabel?: string;
  catalog?: { id: string; title: string }[];
  folderPaths?: string[];
  onClose: () => void;
  onSubmit: (payload: { folderName?: string; itemId?: string; parentPath: string }) => void;
}

export function TreeActionModal({
  isOpen,
  mode,
  itemLabel = 'Item',
  catalog = [],
  folderPaths = [],
  onClose,
  onSubmit,
}: TreeActionModalProps) {
  const [folderName, setFolderName] = useState('');
  const [selectedItemId, setSelectedItemId] = useState(catalog[0]?.id ?? '');
  const [parentPath, setParentPath] = useState(folderPaths[0] || '');

  useEffect(() => {
    if (!isOpen) return;
    setFolderName('');
    setSelectedItemId(catalog[0]?.id ?? '');
    setParentPath(folderPaths[0] || '');
  }, [isOpen, catalog, folderPaths]);

  if (!isOpen || typeof document === 'undefined') return null;

  const canSubmit =
    mode === 'add-folder'
      ? folderName.trim().length > 0
      : Boolean(selectedItemId) && (folderPaths.length === 0 || parentPath !== '');

  const handleSubmit = () => {
    if (mode === 'add-folder') {
      if (!folderName.trim()) return;
      onSubmit({ folderName: folderName.trim(), parentPath });
    } else {
      if (!selectedItemId) return;
      onSubmit({ itemId: selectedItemId, parentPath });
    }
    onClose();
  };

  const title = mode === 'add-folder' ? '➕ Add Folder' : '🗂️ Assign Item';

  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-dialog">
        <h3 className="modal-title">{title}</h3>

        {mode === 'add-folder' ? (
          <>
            <label className="modal-label">
              Folder name
              <input
                type="text"
                className="modal-input"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="e.g. Travel"
              />
            </label>
            <label className="modal-label">
              Parent folder
              <select
                className="modal-input"
                value={parentPath}
                onChange={(e) => setParentPath(e.target.value)}
              >
                <option value="">Root</option>
                {folderPaths.map((path) => (
                  <option key={path || 'root'} value={path}>
                    {path || 'Root'}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="modal-label">
              {itemLabel}
              <select
                className="modal-input"
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
              >
                {catalog.length === 0 ? (
                  <option value="">No items available</option>
                ) : (
                  catalog.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="modal-label">
              Parent folder
              <select
                className="modal-input"
                value={parentPath}
                onChange={(e) => setParentPath(e.target.value)}
                disabled={folderPaths.length === 0}
              >
                {folderPaths.length === 0 ? (
                  <option value="">Create a folder first</option>
                ) : (
                  <>
                    <option value="">Root</option>
                    {folderPaths.map((path) => (
                      <option key={path || 'root'} value={path}>
                        {path || 'Root'}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </label>
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="toolbar-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="toolbar-btn" onClick={handleSubmit} disabled={!canSubmit}>
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
