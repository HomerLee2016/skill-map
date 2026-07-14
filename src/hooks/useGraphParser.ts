// src/hooks/useGraphParser.ts
import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { Node, Edge } from 'reactflow';
import { MarkerType } from 'reactflow';
import YAML from 'yaml';
import type { ExtendedRoadmapNode } from '../types';

/**
 * Parses YAML text into React Flow nodes and edges.
 * Handles both flat‑list (dependsOn) and nested‑tree formats.
 * Updates error state if parsing fails.
 */
export function useGraphParser({
  yamlText,
  setNodes,
  setEdges,
  setError,
  showDetails,
  onLabelChange,
  onToggleFinished,
  onEditClick,
  selectRoadmap,
  ignoreYamlUpdateRef,
}: {
  yamlText: string;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  setError: (msg: string | null) => void;
  showDetails: boolean;
  onLabelChange: (id: string, newLabel: string) => void;
  onToggleFinished: (id: string, finished: boolean) => void;
  onEditClick: (id: string) => void;
  selectRoadmap: (id: string) => void;
  ignoreYamlUpdateRef: MutableRefObject<boolean>;
}) {
  const lastParsedYamlRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      if (ignoreYamlUpdateRef.current) {
        ignoreYamlUpdateRef.current = false;
        return;
      }
      if (!yamlText) return;
      if (lastParsedYamlRef.current === yamlText) return;
      lastParsedYamlRef.current = yamlText;

      const parsed = YAML.parse(yamlText);
      if (!parsed) return;

      const generatedNodes: Node[] = [];
      const generatedEdges: Edge[] = [];
      const visitedIds = new Set<string>();

      if (Array.isArray(parsed)) {
        // Flat list format
        parsed.forEach((node: ExtendedRoadmapNode) => {
          const nodeId = node.id;
          if (visitedIds.has(nodeId)) return;
          visitedIds.add(nodeId);

          const position = {
            x: node.x !== undefined ? node.x : 100,
            y: node.y !== undefined ? node.y : 100,
          };

          generatedNodes.push({
            id: nodeId,
            type: 'skillNode',
            data: {
              label: node.label,
              description: node.description,
              finished: !!node.finished,
              url: node.url,
              quizUrl: node.quizUrl,
              subTreeId: node.subTreeId,
              showDescription: showDetails,
              onLabelChange,
              onToggleFinished,
              onEditClick,
              onGoToSubTree: selectRoadmap,
            },
            position,
          });

          if (node.dependsOn && Array.isArray(node.dependsOn)) {
            node.dependsOn.forEach(depId => {
              generatedEdges.push({
                id: `e-${depId}-${nodeId}`,
                source: depId,
                target: nodeId,
                markerEnd: { type: MarkerType.ArrowClosed, color: '#646cff' },
                style: { stroke: '#646cff', strokeWidth: 2 },
              });
            });
          }
        });
      } else {
        // Nested tree format (legacy)
        const traverseNested = (
          node: ExtendedRoadmapNode,
          parentId: string | null = null,
          depth = 0,
          index = 0,
        ) => {
          const nodeId = node.id;
          if (visitedIds.has(nodeId)) return;
          visitedIds.add(nodeId);

          const position = {
            x: node.x !== undefined ? node.x : index * 350 + 50,
            y: node.y !== undefined ? node.y : depth * 150 + 50,
          };

          generatedNodes.push({
            id: nodeId,
            type: 'skillNode',
            data: {
              label: node.label,
              description: node.description,
              finished: !!node.finished,
              url: node.url,
              quizUrl: node.quizUrl,
              subTreeId: node.subTreeId,
              showDescription: showDetails,
              onLabelChange,
              onToggleFinished,
              onEditClick,
              onGoToSubTree: selectRoadmap,
            },
            position,
          });

          if (parentId) {
            generatedEdges.push({
              id: `e-${parentId}-${nodeId}`,
              source: parentId,
              target: nodeId,
              markerEnd: { type: MarkerType.ArrowClosed, color: '#646cff' },
              style: { stroke: '#646cff', strokeWidth: 2 },
            });
          }

          if (node.children && Array.isArray(node.children)) {
            node.children.forEach((child, childIndex) => {
              traverseNested(child, nodeId, depth + 1, index + childIndex);
            });
          }
        };
        traverseNested(parsed);
      }

      setNodes(generatedNodes);
      setEdges(generatedEdges);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to parse YAML');
    }
  }, [
    yamlText,
    setNodes,
    setEdges,
    setError,
    showDetails,
    onLabelChange,
    onToggleFinished,
    onEditClick,
    selectRoadmap,
   ignoreYamlUpdateRef,
  ]);
}
