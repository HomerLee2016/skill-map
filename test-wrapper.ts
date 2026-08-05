// test-wrapper.ts
// This script discovers and runs all *.test.ts and *.test.tsx files in the project.
// It is executed via the npm "test" script.
import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';

/** Recursively collect test files matching the given pattern */
function collectTestFiles(dir: string, pattern: RegExp, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      collectTestFiles(fullPath, pattern, files);
    } else if (pattern.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

// Pattern matches *.test.ts or *.test.tsx
const testPattern = /\.test\.(ts|tsx)$/i;
const projectRoot = process.cwd();
const testFiles = collectTestFiles(projectRoot, testPattern);

if (testFiles.length === 0) {
  console.warn('⚠️ No test files found.');
} else {
  // Dynamically import each test file so that its top-level code (e.g., test definitions) runs.
  await Promise.all(testFiles.map((file) => import(pathToFileURL(file).href)));

}
