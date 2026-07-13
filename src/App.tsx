import { useState, useEffect, useRef, useCallback } from 'react';
import YAML from 'yaml';
import CodeEditor from '@uiw/react-textarea-code-editor';
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  addEdge,
  Panel,
  type Node,
  type Edge,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { RoadmapNode } from './types';

// Import YAML roadmaps as raw strings from the data folder
const yamlModules = import.meta.glob('./data/*.yaml', { query: '?raw', eager: true });

// Extend RoadmapNode type locally to support new properties
interface ExtendedRoadmapNode extends RoadmapNode {
  finished?: boolean;
  url?: string;
  quizUrl?: string;
  subTreeId?: string; // Reference to another tree ID
  children?: ExtendedRoadmapNode[];
}

interface SavedRoadmap {
  id: string;
  name: string;
  yaml: string;
}

// Map the dynamically loaded YAML modules to the initial state
const initialRoadmaps: SavedRoadmap[] = Object.entries(yamlModules).map(([path, module]: [string, any]) => {
  const yamlContent = module.default as string;
  let label = 'Untitled Roadmap';
  let id = 'untitled';
  try {
    const parsed = YAML.parse(yamlContent);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Flat list format: root node is usually the one with no dependencies, or the first one
      const rootNode = parsed.find(n => !n.dependsOn || n.dependsOn.length === 0) || parsed[0];
      label = rootNode.label || label;
      id = rootNode.id || path.split('/').pop()?.replace('.yaml', '') || id;
    } else if (parsed) {
      label = parsed.label || label;
      id = parsed.id || path.split('/').pop()?.replace('.yaml', '') || id;
    }
  } catch (e) {
    console.error(`Error parsing dynamic roadmap label from ${path}`, e);
  }
  return {
    id,
    name: label, // Using the exact label from the YAML file
    yaml: yamlContent,
  };
});

// Custom SkillNode Component
function SkillNode({ id, data, isConnectable }: NodeProps) {
  return (
    <div style={{
      background: data.finished ? '#eefbf4' : '#ffffff',
      color: '#1a1a1a',
      border: data.finished ? '2.5px solid #2e7d32' : '2.5px solid #646cff',
      borderRadius: '10px',
      padding: '12px 16px',
      fontWeight: '600',
      fontSize: '14px',
      width: 'max-content',
      maxWidth: '280px',
      wordBreak: 'break-word',
      textAlign: 'center',
      position: 'relative',
      boxShadow: data.finished
        ? '0 8px 16px -2px rgba(46, 125, 50, 0.15), 0 4px 6px -1px rgba(0, 0, 0, 0.05)'
        : '0 8px 16px -2px rgba(100, 108, 255, 0.15), 0 4px 6px -1px rgba(0, 0, 0, 0.05)',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    }}>
      {/* Top Handle - Prerequisite (Target) */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: data.finished ? '#2e7d32' : '#646cff',
          width: '10px',
          height: '10px',
          border: '2px solid #ffffff',
        }}
        isConnectable={isConnectable}
        title="Prerequisite (Connect here)"
      />

      {/* Top Left: Checkbox for progress */}
      <div style={{ position: 'absolute', top: '6px', left: '8px', zIndex: 10 }}>
        <input
          type="checkbox"
          checked={!!data.finished}
          onChange={(e) => data.onToggleFinished(id, e.target.checked)}
          style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#2e7d32' }}
          title="Mark as completed"
        />
      </div>

      {/* Top Right Buttons: Pencil & Delete */}
      <div style={{ position: 'absolute', top: '4px', right: '4px', display: 'flex', gap: '3px', zIndex: 10 }}>
        {/* Pencil Edit Icon */}
        <button
          onClick={() => data.onEditClick(id)}
          style={{
            background: '#f1f1f1',
            border: 'none',
            borderRadius: '4px',
            width: '20px',
            height: '20px',
            fontSize: '11px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
          title="Edit Node Details"
        >
          ✏️
        </button>

        {/* Delete Button */}
        <button
          onClick={() => data.onDelete(id)}
          style={{
            background: '#ff4d4d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            width: '20px',
            height: '20px',
            fontSize: '11px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            fontWeight: 'bold',
          }}
          title="Delete Node"
        >
          ×
        </button>
      </div>

      {/* Node Content */}
      <div style={{ marginTop: '10px', marginBottom: '2px', padding: '0 12px' }}>
        <div style={{ textDecoration: data.finished ? 'line-through' : 'none', color: data.finished ? '#555' : '#1a1a1a' }}>
          {data.label}
        </div>
      </div>

      {data.showDescription && data.description && (
        <div style={{ fontSize: '11px', color: '#666', marginTop: '6px', fontWeight: 'normal', padding: '0 4px' }}>
          {data.description}
        </div>
      )}

      {/* Sub-tree link */}
      {data.subTreeId && (
        <div style={{ marginTop: '6px' }}>
          <button
            onClick={() => data.onGoToSubTree(data.subTreeId)}
            style={{
              background: '#e0e7ff',
              color: '#3730a3',
              border: '1px solid #c7d2fe',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            📂 Go to Sub-tree
          </button>
        </div>
      )}

      {/* Footer Icons: Link & Quiz */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '8px' }}>
        {data.url && (
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ textDecoration: 'none', fontSize: '13px' }}
            title="Open reference link"
          >
            🔗
          </a>
        )}
        {data.quizUrl && (
          <a
            href={data.quizUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ textDecoration: 'none', fontSize: '13px' }}
            title="Take external homework/quiz"
          >
            📝
          </a>
        )}
      </div>

      {/* Bottom Handle - Next Skill (Source) */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: data.finished ? '#2e7d32' : '#646cff',
          width: '10px',
          height: '10px',
          border: '2px solid #ffffff',
        }}
        isConnectable={isConnectable}
        title="Next Skill (Drag from here)"
      />
    </div>
  );
}

const nodeTypes = {
  skillNode: SkillNode,
};

// Helper to convert graph to flat array of nodes with dependsOn references
function graphToFlatList(nodes: Node[], edges: Edge[]): ExtendedRoadmapNode[] {
  const dependencyMap = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!dependencyMap.has(e.target)) {
      dependencyMap.set(e.target, []);
    }
    dependencyMap.get(e.target)!.push(e.source);
  });

  return nodes.map((n) => {
    const dependsOn = dependencyMap.get(n.id);
    const res: ExtendedRoadmapNode = {
      id: n.id,
      label: n.data.label,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      finished: !!n.data.finished,
    };

    if (n.data.description) res.description = n.data.description;
    if (n.data.url) res.url = n.data.url;
    if (n.data.quizUrl) res.quizUrl = n.data.quizUrl;
    if (n.data.subTreeId) res.subTreeId = n.data.subTreeId;
    if (dependsOn && dependsOn.length > 0) {
      res.dependsOn = dependsOn;
    }

    return res;
  });
}

// Compute centered layout positions to prevent crossing lines (Smarter width step 350 to prevent overlap)
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
      nextLeafX += 350; // Increased spacing to 350 to account for expanded node widths
    } else {
      children.forEach((cId) => {
        layoutNode(cId, depth + 1);
      });

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

  roots.forEach((root) => {
    layoutNode(root.id, 0);
  });

  return positions;
}

export default function App() {
  // Saved roadmaps list (Ribbon) loaded dynamically from initialRoadmaps
  const [roadmaps, setRoadmaps] = useState<SavedRoadmap[]>(initialRoadmaps);
  const [selectedRoadmapId, setSelectedRoadmapId] = useState<string>(initialRoadmaps[0]?.id || 'untitled');

  // Active roadmap states
  const [yamlText, setYamlText] = useState<string>(initialRoadmaps[0]?.yaml || '');
  const [yamlVisible, setYamlVisible] = useState<boolean>(false); // hidden by default
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [error, setError] = useState<string | null>(null);
  const [showDescriptions, setShowDescriptions] = useState<boolean>(true);

  // Modal / Editing states
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDetail, setEditDetail] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editQuizUrl, setEditQuizUrl] = useState('');
  const [editSubTreeId, setEditSubTreeId] = useState('');

  // Custom Resizer States
  const [leftWidth, setLeftWidth] = useState<number>(450);
  const isDragging = useRef<boolean>(false);
  const ignoreYamlUpdateRef = useRef<boolean>(false);

  // State for selected edge (highlighted)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Listen for Delete key to remove selected edge without prompt and sync YAML
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedEdgeId) {
        setEdges((eds) => {
          const newEdges = eds.filter((edge) => edge.id !== selectedEdgeId);
          // Sync to YAML after deletion
          syncGraphToYaml(nodes, newEdges);
          return newEdges;
        });
        setSelectedEdgeId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEdgeId, nodes]);

  // Helper to calculate tree completion percentage for a given YAML text (flat list or nested tree supported)
  const calculateCompleteness = (yaml: string): number => {
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
  };

  // Sync state changes to YAML editor
  const syncGraphToYaml = (currentNodes: Node[], currentEdges: Edge[]) => {
    ignoreYamlUpdateRef.current = true;
    const flatList = graphToFlatList(currentNodes, currentEdges);
    if (flatList && flatList.length > 0) {
      const newYaml = YAML.stringify(flatList);
      setYamlText(newYaml);
      // Also update in list
      setRoadmaps((prev) =>
        prev.map((r) => {
          if (r.id === selectedRoadmapId) {
            let newLabel = r.name;
            try {
              // Find the root label (node without dependencies, or first)
              const parsed = YAML.parse(newYaml);
              if (Array.isArray(parsed) && parsed.length > 0) {
                const rootNode = parsed.find(n => !n.dependsOn || n.dependsOn.length === 0) || parsed[0];
                newLabel = rootNode.label || newLabel;
              }
            } catch {}
            return { ...r, name: newLabel, yaml: newYaml };
          }
          return r;
        })
      );
    }
  };

  // Switch roadmap tree
  const selectRoadmap = (id: string) => {
    setSelectedRoadmapId(id);
    const target = roadmaps.find((r) => r.id === id);
    if (target) {
      setYamlText(target.yaml);
    }
  };

  // Add a new empty roadmap
  const onCreateRoadmap = () => {
    const newId = `roadmap-${Date.now()}`;
    const newYaml = `- id: custom_roadmap_${Date.now().toString().slice(-4)}\n  label: New Custom Roadmap\n  description: A brand new roadmap.\n  x: 100\n  y: 50\n  finished: false`;
    const newRoadmap: SavedRoadmap = {
      id: newId,
      name: 'New Custom Roadmap',
      yaml: newYaml,
    };
    setRoadmaps((prev) => [...prev, newRoadmap]);
    setSelectedRoadmapId(newId);
    setYamlText(newYaml);
  };

  // Node UI Event Handlers
  const onLabelChange = useCallback((id: string, newLabel: string) => {
    setNodes((nds) => {
      const nextNodes = nds.map((n) => {
        if (n.id === id) {
          return { ...n, data: { ...n.data, label: newLabel } };
        }
        return n;
      });
      setEdges((eds) => {
        syncGraphToYaml(nextNodes, eds);
        return eds;
      });
      return nextNodes;
    });
  }, [setNodes, selectedRoadmapId]);

  const onToggleFinished = useCallback((id: string, finished: boolean) => {
    setNodes((nds) => {
      const nextNodes = nds.map((n) => {
        if (n.id === id) {
          return { ...n, data: { ...n.data, finished } };
        }
        return n;
      });
      setEdges((eds) => {
        syncGraphToYaml(nextNodes, eds);
        return eds;
      });
      return nextNodes;
    });
  }, [setNodes, selectedRoadmapId]);

  const onDeleteNode = useCallback((id: string) => {
    setNodes((nds) => {
      const nextNodes = nds.filter((n) => n.id !== id);
      setEdges((eds) => {
        const nextEdges = eds.filter((e) => e.source !== id && e.target !== id);
        syncGraphToYaml(nextNodes, nextEdges);
        return nextEdges;
      });
      return nextNodes;
    });
  }, [setNodes, setEdges, selectedRoadmapId]);

  const onEditClick = useCallback((id: string) => {
    setNodes((nds) => {
      const node = nds.find((n) => n.id === id);
      if (node) {
        setEditingNodeId(id);
        setEditTitle(node.data.label || '');
        setEditDetail(node.data.description || '');
        setEditUrl(node.data.url || '');
        setEditQuizUrl(node.data.quizUrl || '');
        setEditSubTreeId(node.data.subTreeId || '');
      }
      return nds;
    });
  }, [setNodes]);

  const saveNodeEdits = () => {
    if (!editingNodeId) return;
    setNodes((nds) => {
      const nextNodes = nds.map((n) => {
        if (n.id === editingNodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              label: editTitle,
              description: editDetail,
              url: editUrl,
              quizUrl: editQuizUrl,
              subTreeId: editSubTreeId,
            },
          };
        }
        return n;
      });
      setEdges((eds) => {
        syncGraphToYaml(nextNodes, eds);
        return eds;
      });
      return nextNodes;
    });
    setEditingNodeId(null);
  };

  // Handle Dragging Events for Layout Resize
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.addEventListener('mousemove', resizePanel);
    document.addEventListener('mouseup', stopResize);
  };

  const resizePanel = (e: MouseEvent) => {
    if (!isDragging.current) return;
    const newWidth = Math.max(200, Math.min(e.clientX - 200, window.innerWidth * 0.7)); // adjust for 200px sidebar
    setLeftWidth(newWidth);
  };

  const stopResize = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', resizePanel);
    document.removeEventListener('mouseup', stopResize);
  };

  // Parse YAML text to nodes and edges state (Supports both Flat List with dependsOn & Nested Tree formats)
  useEffect(() => {
    if (ignoreYamlUpdateRef.current) {
      ignoreYamlUpdateRef.current = false;
      return;
    }
    try {
      if (!yamlText) return;
      const parsed = YAML.parse(yamlText);
      if (!parsed) return;

      const generatedNodes: Node[] = [];
      const generatedEdges: Edge[] = [];
      const visitedIds = new Set<string>();

      if (Array.isArray(parsed)) {
        // 1. Flat List format (dependsOn)
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
              showDescription: showDescriptions,
              onLabelChange,
              onToggleFinished,
              onDelete: onDeleteNode,
              onEditClick,
              onGoToSubTree: selectRoadmap,
            },
            position,
          });

          if (node.dependsOn && Array.isArray(node.dependsOn)) {
            node.dependsOn.forEach((depId) => {
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
        // 2. Nested Tree format (Backward Compatibility)
        const traverseNested = (
          node: ExtendedRoadmapNode,
          parentId: string | null = null,
          depth = 0,
          index = 0
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
              showDescription: showDescriptions,
              onLabelChange,
              onToggleFinished,
              onDelete: onDeleteNode,
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
      setError(err.message || "Failed to parse YAML");
    }
  }, [yamlText, onLabelChange, onToggleFinished, onDeleteNode, onEditClick, setNodes, setEdges, showDescriptions]);

  // Pass showDescriptions changes down to existing nodes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, showDescription: showDescriptions },
      }))
    );
  }, [showDescriptions, setNodes]);

  // Connect handler
  const onConnect = useCallback(
    (params: any) => {
      setEdges((eds) => {
        const nextEdges = addEdge(
          {
            ...params,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#646cff' },
            style: { stroke: '#646cff', strokeWidth: 2 },
          },
          eds
        );
        setTimeout(() => {
          setNodes((nds) => {
            syncGraphToYaml(nds, nextEdges);
            return nds;
          });
        }, 0);
        return nextEdges;
      });
    },
    [setEdges, setNodes, selectedRoadmapId]
  );

  // Delete edge on click
  // Select edge on click (highlight)
  const onEdgeClick = useCallback((
    _: React.MouseEvent,
    edge: Edge
  ) => {
    setSelectedEdgeId(edge.id);
  }, []);


  // Highlight selected edge visually
  useEffect(() => {
    setEdges((eds) =>
      eds.map((e) => {
        const isSelected = e.id === selectedEdgeId;
        const newStyle = {
          ...e.style,
          stroke: isSelected ? '#ff4d4d' : '#646cff',
          strokeWidth: isSelected ? 3 : 2,
        };
        // Only update if style actually changes to avoid unnecessary re-renders
        if (e.style?.stroke !== newStyle.stroke || e.style?.strokeWidth !== newStyle.strokeWidth) {
          return { ...e, style: newStyle };
        }
        return e;
      })
    );
  }, [selectedEdgeId]);

  // Add new skill node in UI
  const onCreateNode = () => {
    const randomId = `skill-${Math.random().toString(36).substring(2, 6)}`;
    const newNode: Node = {
      id: randomId,
      type: 'skillNode',
      position: { x: 200, y: 150 },
      data: {
        label: 'New Skill Node',
        showDescription: showDescriptions,
        finished: false,
        onLabelChange,
        onToggleFinished,
        onDelete: onDeleteNode,
        onEditClick,
        onGoToSubTree: selectRoadmap,
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

  // Auto-Align Nodes in visual tree (Smarter Callback to resolve the stale state override bug)
  const onAutoAlign = useCallback(() => {
    if (nodes.length === 0) return;
    const alignedPositions = computeAutoAlignedPositions(nodes, edges);
    const nextNodes = nodes.map((n) => ({
      ...n,
      position: alignedPositions.get(n.id) || n.position,
    }));
    
    // Perform layout update in one clean synchronous pass
    setNodes(nextNodes);
    syncGraphToYaml(nextNodes, edges);
  }, [nodes, edges, selectedRoadmapId, setNodes]);

  const currentProgress = calculateCompleteness(yamlText);

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', fontFamily: 'sans-serif', overflow: 'hidden' }}>

      {/* LEFTMOST SIDEBAR RIBBON: Roadmap Tree Store */}
      <div style={{ width: '200px', height: '100%', backgroundColor: '#18181c', color: '#fff', display: 'flex', flexDirection: 'column', borderRight: '1px solid #2d2d34', flexShrink: 0 }}>
        <div style={{ padding: '16px', background: '#111', fontWeight: 'bold', fontSize: '14px', borderBottom: '1px solid #2d2d34', letterSpacing: '0.5px' }}>
          🗺️ My Skill Maps
        </div>
        <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
          {roadmaps.map((r) => {
            const progress = calculateCompleteness(r.yaml);
            return (
              <button
                key={r.id}
                onClick={() => selectRoadmap(r.id)}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: selectedRoadmapId === r.id ? '#2a2b36' : 'transparent',
                  color: selectedRoadmapId === r.id ? '#646cff' : '#a0a0a5',
                  border: selectedRoadmapId === r.id ? '1px solid #646cff' : '1px solid transparent',
                  borderRadius: '6px',
                  textAlign: 'left',
                  fontWeight: '600',
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
                onMouseEnter={(e) => {
                  if (selectedRoadmapId !== r.id) e.currentTarget.style.background = '#20212a';
                }}
                onMouseLeave={(e) => {
                  if (selectedRoadmapId !== r.id) e.currentTarget.style.background = 'transparent';
                }}
              >
                <span>{r.name}</span>
                {/* Progress bar under roadmap name in sidebar */}
                <div style={{ width: '100%', height: '4px', background: '#3a3a44', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: '#2e7d32', transition: 'width 0.3s' }} />
                </div>
                <span style={{ fontSize: '10px', color: '#888' }}>Completeness: {progress}%</span>
              </button>
            );
          })}
          
          <button
            onClick={onCreateRoadmap}
            style={{
              width: '100%',
              padding: '10px',
              background: '#222',
              color: '#fff',
              border: '1px dashed #444',
              borderRadius: '6px',
              fontWeight: '600',
              fontSize: '12px',
              cursor: 'pointer',
              marginTop: '10px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = '#646cff'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = '#444'}
          >
            ➕ New Roadmap Tree
          </button>
        </div>
      </div>

      {/* LEFT SIDE: YAML Editor Container */}
      <div style={{ width: `${leftWidth}px`, height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#1e1e1e', flexShrink: 0 }}>
        <div style={{ padding: '10px', background: '#242424', color: '#fff', fontWeight: 'bold' }}>
          📝 YAML Roadmap Editor
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <CodeEditor
            value={yamlText}
            language="yaml"
            placeholder="Please enter YAML code."
            onChange={(ev) => setYamlText(ev.target.value)}
            padding={15}
            style={{
              fontSize: 14,
              backgroundColor: "#1e1e1e",
              fontFamily: 'ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace',
              minHeight: '100%'
            }}
            data-color-mode="dark"
          />
        </div>

        {error && (
          <div style={{ padding: '10px', background: '#ff4d4d', color: '#fff', fontSize: '12px', overflowX: 'auto', zIndex: 10 }}>
            <strong>Error:</strong> {error}
          </div>
        )}
      </div>

      {/* DRAGGABLE BAR RESIZER */}
      <div
        onMouseDown={startResize}
        style={{
          width: '6px',
          cursor: 'col-resize',
          background: '#444',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.2s',
          zIndex: 10
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#646cff')}
        onMouseLeave={(e) => (e.currentTarget.style.background = '#444')}
      />

      {/* RIGHT SIDE: Visual Tree Graph */}
      <div style={{ flex: 1, height: '100%', backgroundColor: '#f9f9f9', position: 'relative' }}>
        {/* Top Centered Progress HUD */}
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(255, 255, 255, 0.95)',
          padding: '10px 20px',
          borderRadius: '20px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.08)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: '15px',
          pointerEvents: 'auto'
        }}>
          <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>🚀 Progress</span>
          <div style={{ width: '150px', height: '8px', background: '#e0e0e0', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${currentProgress}%`, height: '100%', background: '#2e7d32', transition: 'width 0.4s ease-out' }} />
          </div>
          <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#2e7d32' }}>{currentProgress}%</span>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          onEdgeClick={onEdgeClick}
        >
          <Background color="#ccc" gap={16} />
          <Controls />
          
          {/* Vertical Panel buttons on Right, Tooltip keeps at Top-Right */}
          <Panel position="top-right" style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255, 255, 255, 0.95)', padding: '12px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxWidth: '280px', marginTop: '50px' }}>
            <button
              onClick={onCreateNode}
              style={{
                background: '#646cff',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#535bf2'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#646cff'}
            >
              ➕ Create Node
            </button>
            <button
              onClick={onAutoAlign}
              style={{
                background: '#4caf50',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#43a047'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#4caf50'}
            >
              📐 Auto-Align Tree
            </button>
            <button
              onClick={() => setShowDescriptions((prev) => !prev)}
              style={{
                background: '#ff9800',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#fb8c00'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#ff9800'}
            >
              👁️ {showDescriptions ? 'Hide Details' : 'Show Details'}
            </button>
            <div style={{ fontSize: '11px', color: '#666', borderTop: '1px solid #eee', paddingTop: '6px', marginTop: '4px', lineHeight: '1.4' }}>
              💡 Drag bottom handle to top handle to link. Click ✏️ to customize.
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* EDIT MODAL DIALOG */}
      {editingNodeId && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '24px',
            width: '400px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', color: '#333' }}>✏️ Edit Skill Node</h3>
            
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555' }}>
              Title
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                style={{ width: '100%', padding: '8px', marginTop: '4px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
              />
            </label>

            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555' }}>
              Detail Description
              <textarea
                value={editDetail}
                onChange={(e) => setEditDetail(e.target.value)}
                style={{ width: '100%', padding: '8px', marginTop: '4px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', height: '60px', fontFamily: 'inherit' }}
              />
            </label>

            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555' }}>
              Resource URL
              <input
                type="text"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                placeholder="https://example.com"
                style={{ width: '100%', padding: '8px', marginTop: '4px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
              />
            </label>

            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555' }}>
              Quiz/Homework URL
              <input
                type="text"
                value={editQuizUrl}
                onChange={(e) => setEditQuizUrl(e.target.value)}
                placeholder="https://quiz-resource.com"
                style={{ width: '100%', padding: '8px', marginTop: '4px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
              />
            </label>

            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555' }}>
              Link to Sub-Tree Roadmap
              <select
                value={editSubTreeId}
                onChange={(e) => setEditSubTreeId(e.target.value)}
                style={{ width: '100%', padding: '8px', marginTop: '4px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
              >
                <option value="">-- None --</option>
                {roadmaps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                onClick={() => setEditingNodeId(null)}
                style={{ padding: '8px 16px', background: '#ddd', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={saveNodeEdits}
                style={{ padding: '8px 16px', background: '#646cff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}