import { useCallback } from 'react';

import type { Node, Edge } from 'reactflow';
import YAML from 'yaml';
import type { SavedRoadmap } from '../types';

/**
 * Hook that returns a function to sync the current graph (nodes + edges) to YAML text
 * and also update the roadmap list with the new label.
 */
export function useYamlSync({
  nodes,
  edges,
  yamlText,
  setYamlText,
  setRoadmaps,
  selectedRoadmapId,
  ignoreYamlUpdateRef,
}: {
  nodes: Node[];
  edges: Edge[];
  yamlText: string;
  setYamlText: (t: string) => void;
  setRoadmaps: (updater: (prev: SavedRoadmap[]) => SavedRoadmap[]) => void;
  selectedRoadmapId: string;
  ignoreYamlUpdateRef: React.MutableRefObject<boolean>;
}) {
  const syncGraphToYaml = useCallback(
    (currentNodes: Node[], currentEdges: Edge[]) => {
      ignoreYamlUpdateRef.current = true;
      const flatList = (function graphToFlatList(nodes: Node[], edges: Edge[]) {
        const dependencyMap = new Map<string, string[]>();
        edges.forEach(e => {
          if (!dependencyMap.has(e.target)) dependencyMap.set(e.target, []);
          dependencyMap.get(e.target)!.push(e.source);
        });
        return nodes.map(n => {
          const dependsOn = dependencyMap.get(n.id);
          const data = n.data as any;
          const res: any = {
            id: n.id,
            label: data.label,
            x: Math.round(n.position.x),
            y: Math.round(n.position.y),
            finished: !!data.finished,
          };
          if (data.description) res.description = data.description;
          if (data.url) res.url = data.url;
          if (data.quizUrl) res.quizUrl = data.quizUrl;
          if (data.subTreeId) res.subTreeId = data.subTreeId;
          if (dependsOn && dependsOn.length > 0) res.dependsOn = dependsOn;
          return res;
        });
      })(currentNodes, currentEdges);

      if (flatList && flatList.length > 0) {
        const newYaml = YAML.stringify(flatList);
        if (newYaml !== yamlText) {
          setYamlText(newYaml);
          setRoadmaps(prev =>
            prev.map(r => {
              if (r.id === selectedRoadmapId) {
                let newLabel = r.name;
                try {
                  const parsed = YAML.parse(newYaml);
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    const rootNode = parsed.find((n: any) => !n.dependsOn || n.dependsOn.length === 0) || parsed[0];
                    newLabel = rootNode.label || newLabel;
                  }
                } catch {}
                return { ...r, name: newLabel, yaml: newYaml };
              }
              return r;
            })
          );
        }
      }
    },
    [yamlText, setYamlText, setRoadmaps, selectedRoadmapId, ignoreYamlUpdateRef]
  );

  return { syncGraphToYaml };
}
