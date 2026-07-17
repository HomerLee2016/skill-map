// src/hooks/useEdgeSelection.ts
import { useState, useEffect, useCallback } from 'react';
import type { Edge, Node } from 'reactflow';


/**
 * Manages edge selection, highlighting, and Delete‑key removal.
 * Returns selectedEdgeId, setter, and onEdgeClick handler.
 * Caller must provide setEdges, nodes, and a sync function to keep YAML up‑to‑date.
 */
export function useEdgeSelection({
  setEdges,
  nodes,
  syncGraphToYaml,
}: {
  setEdges: (updater: (eds: Edge[]) => Edge[]) => void;
  nodes: Node[];
  syncGraphToYaml: (nodes: Node[], edges: Edge[]) => void;
}) {
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Highlight selected edge visually
  useEffect(() => {
    setEdges((eds) =>
      eds.map((e) => {
        const isSelected = e.id === selectedEdgeId;
        const newStyle = {
          ...e.style,
          stroke: isSelected ? 'var(--edge-selected-stroke)' : 'var(--edge-stroke)',
          strokeWidth: isSelected ? 3 : 2,
        };
        // Avoid unnecessary re‑render
        if (e.style?.stroke !== newStyle.stroke || e.style?.strokeWidth !== newStyle.strokeWidth) {
          return { ...e, style: newStyle };
        }
        return e;
      })
    );
  }, [selectedEdgeId, setEdges]);

  // Delete selected edge on Delete key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedEdgeId) {
        setEdges((eds) => {
          const newEdges = eds.filter((edge) => edge.id !== selectedEdgeId);
          syncGraphToYaml(nodes, newEdges);
          return newEdges;
        });
        setSelectedEdgeId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEdgeId, setEdges, nodes, syncGraphToYaml]);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
  }, []);

  return { selectedEdgeId, setSelectedEdgeId, onEdgeClick };
}
