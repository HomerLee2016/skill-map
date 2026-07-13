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

const DEFAULT_YAML = `id: calculus
label: Calculus Roadmap
description: Complete guide to mastering Calculus
x: 50
y: 50
children:
  - id: algebra
    label: Basic Algebra
    x: 50
    y: 200
  - id: limits
    label: Limits
    x: 350
    y: 200
    children:
      - id: sandwich
        label: Sandwich Theorem
        x: 350
        y: 350
  - id: derivatives
    label: Derivatives
    x: 650
    y: 200
  - id: integrals
    label: Integrals
    x: 950
    y: 200`;

// Custom SkillNode Component
function SkillNode({ id, data, isConnectable }: NodeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(data.label);

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditValue(data.label);
  };

  const handleSave = () => {
    setIsEditing(false);
    if (editValue.trim() && editValue !== data.label) {
      data.onLabelChange(id, editValue.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  return (
    <div style={{
      background: '#ffffff',
      color: '#1a1a1a',
      border: '2.5px solid #646cff',
      borderRadius: '10px',
      padding: '12px 18px',
      fontWeight: '600',
      fontSize: '14px',
      minWidth: '150px',
      textAlign: 'center',
      position: 'relative',
      boxShadow: '0 8px 16px -2px rgba(100, 108, 255, 0.15), 0 4px 6px -1px rgba(0, 0, 0, 0.05)',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    }}>
      {/* Top Handle - Prerequisite (Target) */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: '#646cff',
          width: '10px',
          height: '10px',
          border: '2px solid #ffffff',
        }}
        isConnectable={isConnectable}
        title="Prerequisite (Connect here)"
      />

      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          data.onDelete(id);
        }}
        style={{
          position: 'absolute',
          top: '-10px',
          right: '-10px',
          background: '#ff4d4d',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: '20px',
          height: '20px',
          fontSize: '11px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
          fontWeight: 'bold',
          transition: 'background 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#e60000'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#ff4d4d'}
      >
        ×
      </button>

      {/* Editable Label */}
      <div style={{ margin: '4px 0' }}>
        {isEditing ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            autoFocus
            style={{
              width: '100%',
              border: '1px solid #646cff',
              borderRadius: '4px',
              padding: '2px 4px',
              fontSize: '14px',
              textAlign: 'center',
              fontWeight: '600',
              outline: 'none',
            }}
          />
        ) : (
          <div
            onDoubleClick={handleStartEdit}
            style={{ cursor: 'pointer', userSelect: 'none' }}
            title="Double-click to edit label"
          >
            {data.label}
          </div>
        )}
      </div>

      {data.description && (
        <div style={{ fontSize: '10px', color: '#666', marginTop: '4px', fontWeight: 'normal' }}>
          {data.description}
        </div>
      )}

      {/* Bottom Handle - Next Skill (Source) */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: '#646cff',
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

// Helper to convert graph to tree YAML structure
function graphToTree(nodes: Node[], edges: Edge[]): RoadmapNode | null {
  if (nodes.length === 0) return null;

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

  // Roots have no incoming links (no parent)
  const roots = nodes.filter((n) => (parentIdsMap.get(n.id) || []).length === 0);

  if (roots.length === 0) {
    roots.push(nodes[0]); // fallback if there's a cycle and no root
  }

  const mainRoot = roots[0];

  const buildNode = (nodeId: string, visited = new Set<string>()): RoadmapNode => {
    visited.add(nodeId);
    const flowNode = nodes.find((n) => n.id === nodeId);
    const label = flowNode?.data?.label || nodeId;
    const description = flowNode?.data?.description;
    const x = flowNode ? Math.round(flowNode.position.x) : 0;
    const y = flowNode ? Math.round(flowNode.position.y) : 0;

    const res: RoadmapNode = {
      id: nodeId,
      label,
      x,
      y,
    };

    if (description) {
      res.description = description;
    }

    const childIds = childIdsMap.get(nodeId) || [];
    const children: RoadmapNode[] = [];

    childIds.forEach((cId) => {
      if (!visited.has(cId)) {
        children.push(buildNode(cId, visited));
      }
    });

    // Attach other roots as children of the main root so they aren't lost
    if (nodeId === mainRoot.id) {
      roots.slice(1).forEach((otherRoot) => {
        if (!visited.has(otherRoot.id)) {
          children.push(buildNode(otherRoot.id, visited));
        }
      });
    }

    if (children.length > 0) {
      res.children = children;
    }

    return res;
  };

  return buildNode(mainRoot.id);
}

export default function App() {
  const [yamlText, setYamlText] = useState<string>(DEFAULT_YAML);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [error, setError] = useState<string | null>(null);

  // Custom Resizer States
  const [leftWidth, setLeftWidth] = useState<number>(450);
  const isDragging = useRef<boolean>(false);
  const ignoreYamlUpdateRef = useRef<boolean>(false);

  // Sync state changes to YAML editor
  const syncGraphToYaml = (currentNodes: Node[], currentEdges: Edge[]) => {
    ignoreYamlUpdateRef.current = true;
    const roadmap = graphToTree(currentNodes, currentEdges);
    if (roadmap) {
      const newYaml = YAML.stringify(roadmap);
      setYamlText(newYaml);
    }
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
  }, [setNodes]);

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
  }, [setNodes, setEdges]);

  // Handle Dragging Events for Layout Resize
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.addEventListener('mousemove', resizePanel);
    document.addEventListener('mouseup', stopResize);
  };

  const resizePanel = (e: MouseEvent) => {
    if (!isDragging.current) return;
    const newWidth = Math.max(250, Math.min(e.clientX, window.innerWidth * 0.7));
    setLeftWidth(newWidth);
  };

  const stopResize = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', resizePanel);
    document.removeEventListener('mouseup', stopResize);
  };

  // Parse YAML text to nodes and edges state
  useEffect(() => {
    if (ignoreYamlUpdateRef.current) {
      ignoreYamlUpdateRef.current = false;
      return;
    }
    try {
      const parsed = YAML.parse(yamlText) as RoadmapNode;
      if (!parsed || !parsed.id) {
        throw new Error("YAML must contain at least a root node with an 'id' and 'label'.");
      }

      const generatedNodes: Node[] = [];
      const generatedEdges: Edge[] = [];
      const visitedIds = new Set<string>();

      const traverse = (
        node: RoadmapNode,
        parentId: string | null = null,
        depth = 0,
        index = 0
      ) => {
        const nodeId = node.id;
        if (visitedIds.has(nodeId)) return;
        visitedIds.add(nodeId);

        const position = {
          x: node.x !== undefined ? node.x : index * 250 + 50,
          y: node.y !== undefined ? node.y : depth * 150 + 50,
        };

        generatedNodes.push({
          id: nodeId,
          type: 'skillNode',
          data: {
            label: node.label,
            description: node.description,
            onLabelChange,
            onDelete: onDeleteNode,
          },
          position,
        });

        if (parentId) {
          generatedEdges.push({
            id: `e-${parentId}-${nodeId}`,
            source: parentId,
            target: nodeId,
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#646cff' },
            style: { stroke: '#646cff', strokeWidth: 2 },
          });
        }

        if (node.children && Array.isArray(node.children)) {
          node.children.forEach((child, childIndex) => {
            traverse(child, nodeId, depth + 1, index + childIndex);
          });
        }
      };

      traverse(parsed);
      setNodes(generatedNodes);
      setEdges(generatedEdges);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to parse YAML");
    }
  }, [yamlText, onLabelChange, onDeleteNode, setNodes, setEdges]);

  // Connect handler
  const onConnect = useCallback(
    (params: any) => {
      setEdges((eds) => {
        const nextEdges = addEdge(
          {
            ...params,
            animated: true,
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
    [setEdges, setNodes]
  );

  // Sync positions after dragging finishes
  const onNodeDragStop = useCallback(() => {
    setNodes((nds) => {
      setEdges((eds) => {
        syncGraphToYaml(nds, eds);
        return eds;
      });
      return nds;
    });
  }, [setNodes, setEdges]);

  // Add new skill node in UI
  const onCreateNode = () => {
    const randomId = `skill-${Math.random().toString(36).substring(2, 6)}`;
    const newNode: Node = {
      id: randomId,
      type: 'skillNode',
      position: { x: 200, y: 150 },
      data: {
        label: 'New Skill Node',
        onLabelChange,
        onDelete: onDeleteNode,
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

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', fontFamily: 'sans-serif', overflow: 'hidden' }}>

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
          transition: 'background 0.2s'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#646cff')}
        onMouseLeave={(e) => (e.currentTarget.style.background = '#444')}
      />

      {/* RIGHT SIDE: Visual Tree Graph */}
      <div style={{ flex: 1, height: '100%', backgroundColor: '#f9f9f9', position: 'relative' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          fitView
        >
          <Background color="#ccc" gap={16} />
          <Controls />
          
          <Panel position="top-right" style={{ display: 'flex', gap: '10px', background: 'rgba(255, 255, 255, 0.95)', padding: '10px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
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
              ➕ Create Skill Node
            </button>
            <div style={{ fontSize: '11px', color: '#666', alignSelf: 'center', maxWidth: '220px', lineHeight: '1.3' }}>
              💡 <strong>Drag bottom handle</strong> to <strong>top handle</strong> to link. <strong>Double-click node</strong> to edit label.
            </div>
          </Panel>
        </ReactFlow>
      </div>

    </div>
  );
}