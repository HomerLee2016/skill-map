import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ResolvedFolder, ResolvedTree, TreeItemRef } from '../../utils/folderStructure';

export function TreeGlobalActions({
  onExpandAll,
  onCollapseAll,
}: {
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  return (
    <div className="tree-global-actions">
      <button
        type="button"
        className="tree-global-actions-btn"
        title="Expand all folders"
        onClick={onExpandAll}
      >
        📂 Expand All
      </button>
      <button
        type="button"
        className="tree-global-actions-btn"
        title="Collapse all folders"
        onClick={onCollapseAll}
      >
        📁 Collapse All
      </button>
    </div>
  );
}

interface ContentTreeSidebarProps {
  tree: ResolvedTree;
  selectedId: string;
  onSelect: (id: string) => void;
  itemClassName?: string;
  selectedClassName?: string;
  depth?: number;
  expandKey?: number;
  collapseKey?: number;
  itemIcon?: string;
}

function collectFolderPaths(tree: ResolvedTree): string[] {
  const paths: string[] = ['__ungrouped__'];
  function recurse(folders: ResolvedFolder[]) {
    for (const f of folders) {
      paths.push(f.path);
      recurse(f.children);
    }
  }
  recurse(tree.folders);
  return paths;
}

function FolderNode({
  folder,
  selectedId,
  onSelect,
  itemClassName = 'tree-item',
  selectedClassName = 'tree-item--selected',
  depth = 0,
  expandedPaths,
  onToggleFolder,
  itemIcon,
}: {
  folder: ResolvedFolder;
  selectedId: string;
  onSelect: (id: string) => void;
  itemClassName?: string;
  selectedClassName?: string;
  depth?: number;
  expandedPaths: Set<string>;
  onToggleFolder: (path: string) => void;
  itemIcon: string;
}) {
  const open = expandedPaths.has(folder.path);

  return (
    <div className="tree-folder" style={{ ['--tree-depth' as string]: depth }}>
      <button
        type="button"
        className="tree-folder-toggle"
        onClick={() => onToggleFolder(folder.path)}
        aria-expanded={open}
      >
        <span className="tree-chevron">{open ? '▼' : '▶'}</span>
        <span className="tree-folder-icon">{open ? '📂' : '📁'}</span>
        <span className="tree-folder-name">{folder.name}</span>
      </button>
      {open && (
        <div className="tree-folder-body">
          {folder.children.map((child) => (
            <FolderNode
              key={child.path}
              folder={child}
              selectedId={selectedId}
              onSelect={onSelect}
              itemClassName={itemClassName}
              selectedClassName={selectedClassName}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              onToggleFolder={onToggleFolder}
              itemIcon={itemIcon}
            />
          ))}
          {folder.items.map((item) => (
            <ItemButton
              key={item.id}
              item={item}
              selectedId={selectedId}
              onSelect={onSelect}
              itemClassName={itemClassName}
              selectedClassName={selectedClassName}
              depth={depth + 1}
              itemIcon={itemIcon}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ItemButton({
  item,
  selectedId,
  onSelect,
  itemClassName,
  selectedClassName,
  depth = 0,
  itemIcon,
}: {
  item: TreeItemRef;
  selectedId: string;
  onSelect: (id: string) => void;
  itemClassName: string;
  selectedClassName: string;
  depth?: number;
  itemIcon: string;
}) {
  const isSelected = selectedId === item.id;
  return (
    <button
      type="button"
      className={isSelected ? `tree-item-button ${itemClassName} ${selectedClassName}` : `tree-item-button ${itemClassName}`}
      style={{ ['--tree-depth' as string]: depth }}
      onClick={() => onSelect(item.id)}
    >
      <span className="tree-chevron-spacer" />
      <span className="tree-item-icon">{itemIcon}</span>
      <span className="tree-item-title">{item.title}</span>
    </button>
  );
}

export function ContentTreeSidebar({
  tree,
  selectedId,
  onSelect,
  itemClassName = 'tree-item',
  selectedClassName = 'tree-item--selected',
  depth = 0,
  expandKey = 0,
  collapseKey = 0,
  itemIcon = '📄',
}: ContentTreeSidebarProps) {
  const allPaths = useMemo(() => collectFolderPaths(tree), [tree]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set(allPaths));

  useEffect(() => {
    if (expandKey > 0) {
      setExpandedPaths(new Set(allPaths));
    }
  }, [expandKey, allPaths]);

  useEffect(() => {
    if (collapseKey > 0) {
      setExpandedPaths(new Set());
    }
  }, [collapseKey]);

  const handleToggleFolder = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const isEmpty =
    tree.folders.length === 0 && tree.items.length === 0 && tree.ungrouped.length === 0;

  if (isEmpty) {
    return <p className="tree-empty">Nothing here yet.</p>;
  }

  const isUngroupedOpen = expandedPaths.has('__ungrouped__');

  return (
    <div className="tree-list">
      {tree.folders.map((folder) => (
        <FolderNode
          key={folder.path}
          folder={folder}
          selectedId={selectedId}
          onSelect={onSelect}
          itemClassName={itemClassName}
          selectedClassName={selectedClassName}
          depth={depth}
          expandedPaths={expandedPaths}
          onToggleFolder={handleToggleFolder}
          itemIcon={itemIcon}
        />
      ))}
      {tree.items.map((item) => (
        <ItemButton
          key={item.id}
          item={item}
          selectedId={selectedId}
          onSelect={onSelect}
          itemClassName={itemClassName}
          selectedClassName={selectedClassName}
          depth={depth}
          itemIcon={itemIcon}
        />
      ))}
      {tree.ungrouped.length > 0 && (
        <div className="tree-folder" style={{ ['--tree-depth' as string]: depth }}>
          <button
            type="button"
            className="tree-folder-toggle"
            onClick={() => handleToggleFolder('__ungrouped__')}
            aria-expanded={isUngroupedOpen}
          >
            <span className="tree-chevron">{isUngroupedOpen ? '▼' : '▶'}</span>
            <span className="tree-folder-icon">📂</span>
            <span className="tree-folder-name">Ungrouped</span>
          </button>
          {isUngroupedOpen && (
            <div className="tree-folder-body">
              {tree.ungrouped.map((item) => (
                <ItemButton
                  key={item.id}
                  item={item}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  itemClassName={itemClassName}
                  selectedClassName={selectedClassName}
                  depth={depth + 1}
                  itemIcon={itemIcon}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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

interface CategorySectionProps {
  title: string;
  onAddFolder?: () => void;
  onAssignItem?: () => void;
  children: ReactNode;
}

export function CategorySection({
  title,
  onAddFolder,
  onAssignItem,
  children,
}: CategorySectionProps) {
  return (
    <section className="tree-section">
      <div className="tree-section-header">
        <div className="tree-category-title">
          <span>{title}</span>
        </div>
        {onAssignItem && (
          <button
            type="button"
            className="tree-assign-item"
            title="Assign item to folder"
            onClick={onAssignItem}
          >
            ⤵
          </button>
        )}
        {onAddFolder && (
          <button
            type="button"
            className="tree-add-folder"
            title="Add folder"
            onClick={onAddFolder}
          >
            +
          </button>
        )}
      </div>
      <div className="tree-section-body">{children}</div>
    </section>
  );
}

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  onAddFolder?: () => void;
  onAssignItem?: () => void;
  children: ReactNode;
  expandKey?: number;
  collapseKey?: number;
}

export function CollapsibleSection({
  title,
  defaultOpen = true,
  onAddFolder,
  onAssignItem,
  children,
  expandKey = 0,
  collapseKey = 0,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (expandKey > 0) {
      setOpen(true);
    }
  }, [expandKey]);

  useEffect(() => {
    if (collapseKey > 0) {
      setOpen(false);
    }
  }, [collapseKey]);

  return (
    <section className="tree-section">
      <div className="tree-section-header">
        <button
          type="button"
          className="tree-section-toggle"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <span className="tree-chevron">{open ? '▼' : '▶'}</span>
          <span>{title}</span>
        </button>
        {onAssignItem && (
          <button
            type="button"
            className="tree-assign-item"
            title="Assign item to folder"
            onClick={onAssignItem}
          >
            ⤵
          </button>
        )}
        {onAddFolder && (
          <button
            type="button"
            className="tree-add-folder"
            title="Add folder"
            onClick={onAddFolder}
          >
            +
          </button>
        )}
      </div>
      {open && <div className="tree-section-body">{children}</div>}
    </section>
  );
}

