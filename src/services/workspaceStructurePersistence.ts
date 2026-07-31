import YAML from 'yaml';
import type { StructureTree, TestsStructureFile } from '../utils/folderStructure';

export type WorkspaceStructureFolder = 'lessons' | 'tests';

export function serializeWorkspaceStructureContent(
  folderName: WorkspaceStructureFolder,
  structure: StructureTree | { revision: StructureTree; new_tests: StructureTree },
): string {
  if (folderName === 'tests') {
    const testsStructure = structure as { revision: StructureTree; new_tests: StructureTree };
    return YAML.stringify({
      revision: testsStructure.revision,
      new_tests: testsStructure.new_tests,
    } as TestsStructureFile);
  }

  return YAML.stringify(structure as StructureTree);
}

export async function writeWorkspaceStructureFile(
  directoryHandle: FileSystemDirectoryHandle | null | undefined,
  folderName: WorkspaceStructureFolder,
  structure: StructureTree | { revision: StructureTree; new_tests: StructureTree },
): Promise<boolean> {
  if (!directoryHandle) {
    return false;
  }

  try {
    const folder = await directoryHandle.getDirectoryHandle(folderName, { create: true });
    const fileHandle = await folder.getFileHandle('structure.yaml', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(serializeWorkspaceStructureContent(folderName, structure));
    await writable.close();
    return true;
  } catch (error) {
    console.error(`Failed to persist ${folderName} structure`, error);
    return false;
  }
}
