import { useState, type ReactNode } from 'react';
import type { ResolvedFolder, ResolvedTree, TreeItemRef } from '../utils/folderStructure';

interface ContentTreeSidebarProps {
  tree: ResolvedTree;
  selectedId: string;
  onSelect: (id: string) => void;
  itemClassName?: string;
  selectedClassName?: string;
  depth?: number;
}

function FolderNode({
  folder,
  selectedId,
  onSelect,
  itemClassName = 'tree-item',
  selectedClassName = 'tree-item--selected',
  depth = 0,
}: {
  folder: ResolvedFolder;
  selectedId: string;
  onSelect: (id: string) => void;
  itemClassName?: string;
  selectedClassName?: string;
  depth?: number;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="tree-folder" style={{ ['--tree-depth' as string]: depth }}>
      <button
        type="button"
        className="tree-folder-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="tree-chevron">{open ? '▼' : '▶'}</span>
        <span className="tree-folder-name">📁 {folder.name}</span>
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
}: {
  item: TreeItemRef;
  selectedId: string;
  onSelect: (id: string) => void;
  itemClassName: string;
  selectedClassName: string;
  depth?: number;
}) {
  return (
    <button
      type="button"
      className={selectedId === item.id ? `${itemClassName} ${selectedClassName}` : itemClassName}
      style={{ ['--tree-depth' as string]: depth }}
      onClick={() => onSelect(item.id)}
    >
      {item.title}
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
}: ContentTreeSidebarProps) {
  const [ungroupedOpen, setUngroupedOpen] = useState(true);
  const isEmpty =
    tree.folders.length === 0 && tree.items.length === 0 && tree.ungrouped.length === 0;

  if (isEmpty) {
    return <p className="tree-empty">Nothing here yet.</p>;
  }

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
        />
      ))}
      {tree.ungrouped.length > 0 && (
        <div className="tree-folder" style={{ ['--tree-depth' as string]: depth }}>
          <button
            type="button"
            className="tree-folder-toggle"
            onClick={() => setUngroupedOpen((value) => !value)}
            aria-expanded={ungroupedOpen}
          >
            <span className="tree-chevron">{ungroupedOpen ? '▼' : '▶'}</span>
            <span className="tree-folder-name">📂 Ungrouped</span>
          </button>
          {ungroupedOpen && (
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
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  onAddFolder?: () => void;
  onAssignItem?: () => void;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  defaultOpen = true,
  onAddFolder,
  onAssignItem,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

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
