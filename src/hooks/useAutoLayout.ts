import { useCallback } from 'react';
import type { Node, Edge } from 'reactflow';

/**
 * Computes centered layout positions to prevent crossing lines.
 * This logic was previously inside App.tsx as `computeAutoAlignedPositions`.
 */
function computeAutoAlignedPositions(nodes: Node[], edges: Edge[]): Map<string, { x: number; y: number }> {
  const childIdsMap = new Map<string, string[]>();
  const parentIdsMap = new Map<string, string[]>();

  nodes.forEach((n) => {
    childIdsMap.set(n.id, []);
    parentIdsMap.set(n.id, []);
  });

  edges.forEach((e) => {
    if (childIdsMap.has(e.source)) {
      childIdsMap.get(e.source)!.push(e.target);
    }
    if (parentIdsMap.has(e.target)) {
      parentIdsMap.get(e.target)!.push(e.source);
    }
  });

  const roots = nodes.filter((n) => (parentIdsMap.get(n.id) || []).length === 0);
  if (roots.length === 0 && nodes.length > 0) {
    roots.push(nodes[0]);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const visited = new Set<string>();
  let nextLeafX = 50;

  const layoutNode = (nodeId: string, depth = 0) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const children = childIdsMap.get(nodeId) || [];
    const y = depth * 150 + 50;

    if (children.length === 0) {
      positions.set(nodeId, { x: nextLeafX, y });
      nextLeafX += 350;
    } else {
      children.forEach((cId) => layoutNode(cId, depth + 1));

      const childPositions = children
        .map((cId) => positions.get(cId))
        .filter((p) => p !== undefined) as { x: number }[];

      if (childPositions.length > 0) {
        const sumX = childPositions.reduce((sum, p) => sum + p.x, 0);
        const avgX = sumX / childPositions.length;
        positions.set(nodeId, { x: avgX, y });
      } else {
        positions.set(nodeId, { x: nextLeafX, y });
        nextLeafX += 350;
      }
    }
  };

  roots.forEach((root) => layoutNode(root.id, 0));
  return positions;
}

/**
 * Hook exposing an `onAutoAlign` callback that aligns nodes using the layout algorithm.
 * It mirrors the previous `onAutoAlign` implementation inside App.tsx.
 */
export const useAutoLayout = (
  nodes: Node[],
  edges: Edge[],
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>, // from useNodesState
  syncGraphToYaml: (nodes: Node[], edges: Edge[]) => void
) => {
  const onAutoAlign = useCallback(() => {
    if (nodes.length === 0) return;
    const alignedPositions = computeAutoAlignedPositions(nodes, edges);
    const nextNodes = nodes.map((n) => ({
      ...n,
      position: alignedPositions.get(n.id) || n.position,
    }));
    setNodes(nextNodes);
    syncGraphToYaml(nextNodes, edges);
  }, [nodes, edges, setNodes, syncGraphToYaml]);

  return onAutoAlign;
};
