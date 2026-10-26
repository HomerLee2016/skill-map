/** Storage key for a workspace folder name; no Dexie import so pure helpers and their tests can use it. */
function simpleHash(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function deriveWorkspaceStorageKey(workspacePath: string | null | undefined): string {
  const normalized = (workspacePath ?? '').trim().toLowerCase();
  const seed = normalized || 'default-workspace';
  return `workspace-${simpleHash(seed)}`;
}
