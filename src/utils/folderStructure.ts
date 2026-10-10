export interface StructureFolder {
  name: string;
  children?: StructureFolder[];
  items?: string[];
}

export interface StructureTree {
  folders?: StructureFolder[];
  items?: string[];
}

export interface TestsStructureFile {
  revision?: StructureTree;
  new_tests?: StructureTree;
}

export interface PickerOption {
  id: string;
  label: string;
  path: string;
}

export interface TreeItemRef {
  id: string;
  title: string;
}

export interface ResolvedFolder {
  name: string;
  path: string;
  children: ResolvedFolder[];
  items: TreeItemRef[];
}

export interface ResolvedTree {
  folders: ResolvedFolder[];
  items: TreeItemRef[];
  ungrouped: TreeItemRef[];
}

function collectIds(tree: StructureTree | undefined, into: Set<string>) {
  if (!tree) return;
  for (const id of tree.items || []) into.add(id);
  const walk = (folders: StructureFolder[] | undefined) => {
    for (const folder of folders || []) {
      for (const id of folder.items || []) into.add(id);
      walk(folder.children);
    }
  };
  walk(tree.folders);
}

export function collectTreeIds(tree: StructureTree | undefined): Set<string> {
  const ids = new Set<string>();
  collectIds(tree, ids);
  return ids;
}

function resolveFolder(
  folder: StructureFolder,
  parentPath: string,
  byId: Map<string, string>,
  knownIds: Set<string>
): ResolvedFolder {
  const path = parentPath ? `${parentPath} / ${folder.name}` : folder.name;
  const items = (folder.items || [])
    .filter((id) => knownIds.has(id))
    .map((id) => ({ id, title: byId.get(id) || id }));
  const children = (folder.children || []).map((child) =>
    resolveFolder(child, path, byId, knownIds)
  );
  return { name: folder.name, path, children, items };
}

export function resolveStructureTree(
  tree: StructureTree | undefined,
  catalog: { id: string; title: string }[],
  options?: { includeUngrouped?: boolean; claimedIds?: Set<string> }
): ResolvedTree {
  const byId = new Map(catalog.map((item) => [item.id, item.title]));
  const knownIds = new Set(catalog.map((item) => item.id));
  const claimed = options?.claimedIds || collectTreeIds(tree);

  const folders = (tree?.folders || []).map((folder) =>
    resolveFolder(folder, '', byId, knownIds)
  );
  const items = (tree?.items || [])
    .filter((id) => knownIds.has(id))
    .map((id) => ({ id, title: byId.get(id) || id }));

  const ungrouped =
    options?.includeUngrouped === false
      ? []
      : catalog
          .filter((item) => !claimed.has(item.id))
          .map((item) => ({ id: item.id, title: item.title }));

  return { folders, items, ungrouped };
}

function flattenFolderOptions(
  folder: ResolvedFolder,
  out: PickerOption[]
) {
  for (const item of folder.items) {
    out.push({
      id: item.id,
      label: `${folder.path} / ${item.title}`,
      path: folder.path,
    });
  }
  for (const child of folder.children) {
    flattenFolderOptions(child, out);
  }
}

export function flattenTreePickerOptions(
  tree: ResolvedTree,
  sectionPrefix?: string
): PickerOption[] {
  const out: PickerOption[] = [];
  const prefix = sectionPrefix ? `${sectionPrefix} › ` : '';

  for (const item of tree.items) {
    out.push({
      id: item.id,
      label: `${prefix}${item.title}`,
      path: sectionPrefix || '',
    });
  }
  for (const folder of tree.folders) {
    const nested: PickerOption[] = [];
    flattenFolderOptions(folder, nested);
    for (const opt of nested) {
      out.push({
        ...opt,
        label: `${prefix}${opt.label}`,
      });
    }
  }
  for (const item of tree.ungrouped) {
    out.push({
      id: item.id,
      label: `${prefix}Ungrouped / ${item.title}`,
      path: sectionPrefix ? `${sectionPrefix} › Ungrouped` : 'Ungrouped',
    });
  }
  return out;
}

/** Deduplicate by id, keeping first occurrence (prefer earlier sections). */
export function uniquePickerOptions(options: PickerOption[]): PickerOption[] {
  const seen = new Set<string>();
  const result: PickerOption[] = [];
  for (const opt of options) {
    if (seen.has(opt.id)) continue;
    seen.add(opt.id);
    result.push(opt);
  }
  return result;
}

export function emptyStructureTree(): StructureTree {
  return { folders: [], items: [] };
}

/** Add a folder at root, or under a folder matched by path segments. */
export function addFolderToTree(
  tree: StructureTree,
  folderName: string,
  parentPath: string[] = []
): StructureTree {
  const name = folderName.trim();
  if (!name) return tree;

  const cloneFolders = (folders: StructureFolder[] = []): StructureFolder[] =>
    folders.map((folder) => ({
      name: folder.name,
      items: [...(folder.items || [])],
      children: cloneFolders(folder.children),
    }));

  const folders = cloneFolders(tree.folders);
  const items = [...(tree.items || [])];

  if (parentPath.length === 0) {
    if (!folders.some((folder) => folder.name === name)) {
      folders.push({ name, items: [], children: [] });
    }
    return { folders, items };
  }

  const insert = (nodes: StructureFolder[], path: string[]): boolean => {
    const [head, ...rest] = path;
    const target = nodes.find((node) => node.name === head);
    if (!target) return false;
    if (rest.length === 0) {
      target.children = target.children || [];
      if (!target.children.some((child) => child.name === name)) {
        target.children.push({ name, items: [], children: [] });
      }
      return true;
    }
    target.children = target.children || [];
    return insert(target.children, rest);
  };

  insert(folders, parentPath);
  return { folders, items };
}

/** List folder paths for parent selection (e.g. ["Spanish", "Spanish / Numbers"]). */
export function listFolderPaths(tree: StructureTree | undefined): string[] {
  const paths: string[] = [];
  const walk = (folders: StructureFolder[] | undefined, parent: string) => {
    for (const folder of folders || []) {
      const path = parent ? `${parent} / ${folder.name}` : folder.name;
      paths.push(path);
      walk(folder.children, path);
    }
  };
  walk(tree?.folders, '');
  return paths;
}

export function pathToSegments(path: string): string[] {
  return path
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Place an item id into a folder (or root items when parentPath is empty). Removes it from other locations in the tree. */
export function assignItemToTree(
  tree: StructureTree,
  itemId: string,
  parentPath: string[] = []
): StructureTree {
  const removeEverywhere = (folders: StructureFolder[] = []): StructureFolder[] =>
    folders.map((folder) => ({
      name: folder.name,
      items: (folder.items || []).filter((id) => id !== itemId),
      children: removeEverywhere(folder.children),
    }));

  let folders = removeEverywhere(tree.folders);
  let items = (tree.items || []).filter((id) => id !== itemId);

  if (parentPath.length === 0) {
    items = [...items, itemId];
    return { folders, items };
  }

  const insert = (nodes: StructureFolder[], path: string[]): boolean => {
    const [head, ...rest] = path;
    const target = nodes.find((node) => node.name === head);
    if (!target) return false;
    if (rest.length === 0) {
      target.items = [...(target.items || []), itemId];
      return true;
    }
    target.children = target.children || [];
    return insert(target.children, rest);
  };

  if (!insert(folders, parentPath)) {
    // Parent missing — put at root instead
    items = [...items, itemId];
  }

  return { folders, items };
}

export function promptAddFolder(structure: StructureTree): StructureTree | null {
  const name = window.prompt('New folder name');
  if (!name?.trim()) return null;

  const paths = listFolderPaths(structure);
  let parentPath: string[] = [];
  if (paths.length > 0) {
    const choice = window.prompt(
      `Parent folder path (leave empty for root).\nAvailable:\n${paths.join('\n')}`,
      ''
    );
    if (choice === null) return null;
    parentPath = choice.trim() ? pathToSegments(choice) : [];
  }

  return addFolderToTree(structure, name.trim(), parentPath);
}

export function promptAssignItem(
  catalog: { id: string; title: string }[],
  structure: StructureTree,
  itemLabel = 'Item'
): StructureTree | null {
  const options = catalog.map((item) => `${item.id} — ${item.title}`).join('\n');
  const itemId = window.prompt(`${itemLabel} id to place in a folder:\n${options}`);
  if (!itemId?.trim()) return null;
  if (!catalog.some((item) => item.id === itemId.trim())) {
    window.alert(`Unknown ${itemLabel.toLowerCase()} id: ${itemId}`);
    return null;
  }

  const paths = listFolderPaths(structure);
  if (paths.length === 0) {
    window.alert('Create a folder first, then assign items into it.');
    return null;
  }
  const choice = window.prompt(
    `Folder path (leave empty for root).\nAvailable:\n${paths.join('\n')}`,
    paths[0]
  );
  if (choice === null) return null;

  const parentPath = choice.trim() ? pathToSegments(choice) : [];
  return assignItemToTree(structure, itemId.trim(), parentPath);
}
