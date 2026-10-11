import YAML from 'yaml';
import type { ExtendedRoadmapNode } from '../types';

export function calculateCompleteness(yaml: string): number {
  try {
    const parsed = YAML.parse(yaml);
    if (!parsed) return 0;
    let total = 0;
    let finished = 0;

    if (Array.isArray(parsed)) {
      parsed.forEach((node) => {
        total++;
        if (node.finished) finished++;
      });
    } else {
      const countNode = (node: ExtendedRoadmapNode) => {
        total++;
        if (node.finished) finished++;
        if (node.children) node.children.forEach(countNode);
      };
      countNode(parsed);
    }

    return total > 0 ? Math.round((finished / total) * 100) : 0;
  } catch {
    return 0;
  }
}

export function getRoadmapLabel(yaml: string, fallback: string): string {
  let newLabel = fallback;
  try {
    const parsed = YAML.parse(yaml);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const rootNode = parsed.find((node: any) => !node.dependsOn || node.dependsOn.length === 0) || parsed[0];
      newLabel = rootNode.label || newLabel;
    } else if (parsed && typeof parsed === 'object' && 'label' in parsed) {
      newLabel = String((parsed as { label?: string }).label || newLabel);
    }
  } catch {}
  return newLabel;
}
