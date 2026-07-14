import React, { useState, useEffect, useRef, useCallback } from 'react';

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

import { EditModal } from './components/EditModal';
import { useGraphParser } from './hooks/useGraphParser';
import { useResizePanel } from './hooks/useResizePanel';
import { useEdgeSelection } from './hooks/useEdgeSelection';
import { useYamlSync } from './hooks/useYamlSync';
import { SkillNode } from './components/SkillNode';
import { useAutoLayout } from './hooks/useAutoLayout';
import { Toolbar } from './components/Toolbar';
import { RoadmapSidebar } from './components/RoadmapSidebar';
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

// Layout logic moved to useAutoLayout hook
function App() {
  // Saved roadmaps list (Ribbon) loaded dynamically from initialRoadmaps
  const [roadmaps, setRoadmaps] = useState<SavedRoadmap[]>(initialRoadmaps);
  const [selectedRoadmapId, setSelectedRoadmapId] = useState<string>(initialRoadmaps[0]?.id || 'untitled');

  // Active roadmap states
  const [yamlText, setYamlText] = useState<string>(initialRoadmaps[0]?.yaml || '');
  const [yamlVisible, setYamlVisible] = useState<boolean>(false); // hidden by default
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<boolean>(true);

  // Modal / Editing states
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDetail, setEditDetail] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editQuizUrl, setEditQuizUrl] = useState('');
  const [editSubTreeId, setEditSubTreeId] = useState('');

  // Custom Resizer Hook
  const { leftWidth, setLeftWidth, startResize } = useResizePanel();
  const ignoreYamlUpdateRef = useRef<boolean>(false);
// Initialize YAML sync hook
const { syncGraphToYaml } = useYamlSync({ nodes, edges, yamlText, setYamlText, setRoadmaps, selectedRoadmapId, ignoreYamlUpdateRef });
// Edge selection hook
const { onEdgeClick } = useEdgeSelection({ setEdges, nodes, syncGraphToYaml });
// Helper to calculate tree completion percentage for a given YAML text (flat list or nested tree supported)

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

  // Use the dedicated parser hook for YAML → graph conversion
  useGraphParser({
    yamlText,
    setNodes,
    setEdges,
    setError,
    showDetails,
    onLabelChange,
    onToggleFinished,
    onDeleteNode,
    onEditClick,
    selectRoadmap,
    ignoreYamlUpdateRef,
  });

  // Pass showDetails changes down to existing nodes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, showDescription: showDetails },
      }))
    );
  }, [showDetails, setNodes]);

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

  // Edge selection and highlighting are handled by the useEdgeSelection hook

  // Add new skill node in UI
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

  const onAutoAlign = useAutoLayout(nodes, edges, setNodes, syncGraphToYaml);

  const currentProgress = calculateCompleteness(yamlText);

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', fontFamily: 'sans-serif', overflow: 'hidden' }}>

<RoadmapSidebar
        roadmaps={roadmaps}
        selectedRoadmapId={selectedRoadmapId}
        onSelectRoadmap={selectRoadmap}
        onCreateRoadmap={onCreateRoadmap}
        leftWidth={leftWidth}
        setLeftWidth={setLeftWidth}
      />

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
            <Toolbar
        onAutoAlign={onAutoAlign}
        showDetails={showDetails}
        setShowDetails={setShowDetails}
        onAddNode={onCreateNode}
      />
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
};
export default App;