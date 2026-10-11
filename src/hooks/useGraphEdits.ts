import { useCallback } from 'react';
import { addEdge, MarkerType, type Edge, type Node } from 'reactflow';

type SetNodes = React.Dispatch<React.SetStateAction<Node[]>>;
type SetEdges = React.Dispatch<React.SetStateAction<Edge[]>>;

interface GraphEditsDeps {
  nodes: Node[];
  edges: Edge[];
  setNodes: SetNodes;
  setEdges: SetEdges;
  syncGraphToYaml: (nodes: Node[], edges: Edge[]) => void;
  showDetails: boolean;
  onEditClick: (id: string) => void;
  selectRoadmap: (id: string) => void;
  onGoToLesson: (id: string) => void;
  onGoToTest: (id: string) => void;
}

export function useGraphEdits({
  nodes, edges, setNodes, setEdges, syncGraphToYaml, showDetails, onEditClick, selectRoadmap, onGoToLesson, onGoToTest,
}: GraphEditsDeps) {
  const updateNodeData = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      setNodes((nds) => {
        const nextNodes = nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n));
        setEdges((eds) => {
          syncGraphToYaml(nextNodes, eds);
          return eds;
        });
        return nextNodes;
      });
    },
    [setNodes, syncGraphToYaml]
  );

  const onLabelChange = useCallback(
    (id: string, newLabel: string) => updateNodeData(id, { label: newLabel }),
    [updateNodeData]
  );

  const onToggleFinished = useCallback(
    (id: string, finished: boolean) => updateNodeData(id, { finished }),
    [updateNodeData]
  );

  const onNodesDelete = useCallback(
    (deletedNodes: Node[]) => {
      const deletedIds = new Set(deletedNodes.map((node) => node.id));
      setNodes((nds) => {
        const nextNodes = nds.filter((node) => !deletedIds.has(node.id));
        setEdges((eds) => {
          const nextEdges = eds.filter((edge) => !deletedIds.has(edge.source) && !deletedIds.has(edge.target));
          syncGraphToYaml(nextNodes, nextEdges);
          return nextEdges;
        });
        return nextNodes;
      });
    },
    [setNodes, setEdges, syncGraphToYaml]
  );

  const persistPositionsToYaml = useCallback(() => {
    syncGraphToYaml(nodes, edges);
  }, [nodes, edges, syncGraphToYaml]);

  const onConnect = useCallback(
    (params: any) => {
      setEdges((eds) => {
        const nextEdges = addEdge(
          {
            ...params,
            markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--edge-stroke)' },
            style: { stroke: 'var(--edge-stroke)', strokeWidth: 2 },
          },
          eds
        );
        setTimeout(() => {
          syncGraphToYaml(nodes, nextEdges);
        }, 0);
        return nextEdges;
      });
    },
    [setEdges, nodes, syncGraphToYaml]
  );

  const onCreateNode = () => {
    const randomId = `skill-${Math.random().toString(36).substring(2, 6)}`;
    const newNode: Node = {
      id: randomId,
      type: 'skillNode',
      position: { x: 200, y: 150 },
      data: {
        label: 'New Skill Node',
        showDescription: showDetails,
        finished: false,
        lessons: [],
        tests: [],
        onLabelChange,
        onToggleFinished,
        onEditClick,
        onGoToSubTree: selectRoadmap,
        onGoToLesson,
        onGoToTest,
      },
    };
    setNodes((nds) => {
      const nextNodes = [...nds, newNode];
      setEdges((eds) => {
        syncGraphToYaml(nextNodes, eds);
        return eds;
      });
      return nextNodes;
    });
  };

  return { onLabelChange, onToggleFinished, onNodesDelete, persistPositionsToYaml, onConnect, onCreateNode };
}
