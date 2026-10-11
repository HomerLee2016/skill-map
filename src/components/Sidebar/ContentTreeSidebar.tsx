import { useEffect, useMemo, useState } from 'react';
import type { ResolvedFolder, ResolvedTree, TreeItemRef } from '../../utils/folderStructure';

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
