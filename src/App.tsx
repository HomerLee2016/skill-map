import { useState, useEffect, useRef, useCallback } from 'react';

import YAML from 'yaml';
import CodeEditor from '@uiw/react-textarea-code-editor';
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  SelectionMode,
  useNodesState,
  useEdgesState,
  addEdge,
  Panel,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { SavedRoadmap, ExtendedRoadmapNode } from './types';

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

// Map the dynamically loaded YAML modules to the initial state
const initialRoadmaps: SavedRoadmap[] = Object.entries(yamlModules).map(([path, module]: [string, any]) => {
  const yamlContent = module.default as string;
  let label = 'Untitled Roadmap';
  const id = path.split('/').pop()?.replace('.yaml', '') || 'untitled';
  try {
    const parsed = YAML.parse(yamlContent);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Flat list format: root node is usually the one with no dependencies, or the first one
      const rootNode = parsed.find(n => !n.dependsOn || n.dependsOn.length === 0) || parsed[0];
      label = rootNode.label || label;
    } else if (parsed) {
      label = parsed.label || label;
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
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [tipsOpen, setTipsOpen] = useState<boolean>(true);

  // Modal / Editing states
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDetail, setEditDetail] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editQuizUrl, setEditQuizUrl] = useState('');
  const [editSubTreeId, setEditSubTreeId] = useState('');

  // Custom Resizer Hook
  const { leftWidth, startResize } = useResizePanel();
  const ignoreYamlUpdateRef = useRef<boolean>(false);
// Initialize YAML sync hook
  const { syncGraphToYaml } = useYamlSync({ yamlText, setYamlText, setRoadmaps, selectedRoadmapId, ignoreYamlUpdateRef });
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

  const saveRoadmap = async () => {
    try {
      const response = await fetch('/api/save-roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roadmapId: selectedRoadmapId, yaml: yamlText }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || 'Failed to save roadmap');
      }
      setRoadmaps((prev) =>
        prev.map((r) => {
          if (r.id !== selectedRoadmapId) return r;
          let newLabel = r.name;
        try {
          const parsed = YAML.parse(yamlText);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const rootNode = parsed.find((n: any) => !n.dependsOn || n.dependsOn.length === 0) || parsed[0];
            newLabel = rootNode.label || newLabel;
          } else if (parsed && typeof parsed === 'object' && parsed.label) {
            newLabel = parsed.label;
          }
        } catch {}
        return { ...r, name: newLabel, yaml: yamlText };
      })
    );
    } catch (error) {
      console.error(error);
      setError(error instanceof Error ? error.message : 'Failed to save roadmap');
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

  const onNodesDelete = useCallback((deletedNodes: Node[]) => {
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
  }, [setNodes, setEdges]);

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
  const persistPositionsToYaml = useCallback(() => {
    syncGraphToYaml(nodes, edges);
  }, [nodes, edges, syncGraphToYaml]);

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
          syncGraphToYaml(nodes, nextEdges);
        }, 0);
        return nextEdges;
      });
    },
    [setEdges, nodes, syncGraphToYaml]
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
      <div className={darkMode ? 'app-shell app-shell-dark' : 'app-shell app-shell-light'} style={{ display: 'flex', width: '100vw', height: '100vh', fontFamily: 'sans-serif', overflow: 'hidden' }}>

      <RoadmapSidebar
        roadmaps={roadmaps}
        selectedRoadmapId={selectedRoadmapId}
        onSelectRoadmap={selectRoadmap}
        onCreateRoadmap={onCreateRoadmap}
        onSaveRoadmap={saveRoadmap}
        yamlVisible={yamlVisible}
        setYamlVisible={setYamlVisible}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
      />

      {/* LEFT SIDE: YAML Editor Container */}
      {yamlVisible && (
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
      )}

      {/* DRAGGABLE BAR RESIZER */}
      {yamlVisible && (
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
      )}

      {/* RIGHT SIDE: Visual Tree Graph */}
      <div style={{ flex: 1, height: '100%', backgroundColor: darkMode ? '#0f1115' : '#f9f9f9', position: 'relative' }}>
        {/* Top Centered Progress HUD */}
        <div className="progress-hud" style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--hud-bg)',
          padding: '10px 20px',
          borderRadius: '20px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.08)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: '15px',
          pointerEvents: 'auto'
        }}>
          <span className="hud-title" style={{ fontSize: '13px', fontWeight: 'bold' }}>🚀 Progress</span>
          <div className="hud-track" style={{ width: '150px', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${currentProgress}%`, height: '100%', background: '#2e7d32', transition: 'width 0.4s ease-out' }} />
          </div>
          <span className="hud-percent" style={{ fontSize: '13px', fontWeight: 'bold' }}>{currentProgress}%</span>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodesDelete={onNodesDelete}
          deleteKeyCode={['Delete', 'Backspace']}
          onConnect={onConnect}
          onNodeDragStop={persistPositionsToYaml}
          onSelectionDragStop={persistPositionsToYaml}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          panOnDrag={[2]}
          selectNodesOnDrag
          fitView
          onEdgeClick={onEdgeClick}
        >
          <Background color="var(--canvas-grid)" gap={16} />
          <Controls />
          
          {/* Vertical Panel buttons on Right, Tooltip keeps at Top-Right */}
                    <Panel position="top-right" className="rf-top-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxWidth: '240px', width: '240px', marginTop: '50px' }}>
            <Toolbar
              onAutoAlign={onAutoAlign}
              showDetails={showDetails}
              setShowDetails={setShowDetails}
              onAddNode={onCreateNode}
              tipsOpen={tipsOpen}
              setTipsOpen={setTipsOpen}
            />
          </Panel>
        </ReactFlow>
      </div>

      <EditModal
        editingNodeId={editingNodeId}
        setEditingNodeId={setEditingNodeId}
        editTitle={editTitle}
        setEditTitle={setEditTitle}
        editDetail={editDetail}
        setEditDetail={setEditDetail}
        editUrl={editUrl}
        setEditUrl={setEditUrl}
        editQuizUrl={editQuizUrl}
        setEditQuizUrl={setEditQuizUrl}
        editSubTreeId={editSubTreeId}
        setEditSubTreeId={setEditSubTreeId}
        roadmaps={roadmaps}
        onSave={saveNodeEdits}
      />

    </div>
  );
};
export default App;

