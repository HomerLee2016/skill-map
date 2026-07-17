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
import { getLessonPickerOptions, getTestPickerOptions } from './utils/contentCatalog';

const yamlModules = import.meta.glob('./data/roadmaps/*.yaml', { query: '?raw', eager: true });

const initialRoadmaps: SavedRoadmap[] = Object.entries(yamlModules).map(([path, module]: [string, any]) => {
  const yamlContent = module.default as string;
  let label = 'Untitled Roadmap';
  const id = path.split('/').pop()?.replace('.yaml', '') || 'untitled';
  try {
    const parsed = YAML.parse(yamlContent);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const rootNode = parsed.find((n) => !n.dependsOn || n.dependsOn.length === 0) || parsed[0];
      label = rootNode.label || label;
    } else if (parsed) {
      label = parsed.label || label;
    }
  } catch (e) {
    console.error(`Error parsing dynamic roadmap label from ${path}`, e);
  }
  return {
    id,
    name: label,
    yaml: yamlContent,
  };
});

const nodeTypes = {
  skillNode: SkillNode,
};

interface RoadmapProps {
  darkMode: boolean;
  onGoToLesson: (id: string) => void;
  onGoToTest: (id: string) => void;
}

function Roadmap({ darkMode, onGoToLesson, onGoToTest }: RoadmapProps) {
  const [roadmaps, setRoadmaps] = useState<SavedRoadmap[]>(initialRoadmaps);
  const [selectedRoadmapId, setSelectedRoadmapId] = useState<string>(initialRoadmaps[0]?.id || 'untitled');
  const [yamlText, setYamlText] = useState<string>(initialRoadmaps[0]?.yaml || '');
  const [yamlVisible, setYamlVisible] = useState<boolean>(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<boolean>(true);
  const [tipsOpen, setTipsOpen] = useState<boolean>(true);

  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDetail, setEditDetail] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editLessons, setEditLessons] = useState<string[]>([]);
  const [editTests, setEditTests] = useState<string[]>([]);
  const [editSubTreeId, setEditSubTreeId] = useState('');

  const { leftWidth, startResize } = useResizePanel();
  const ignoreYamlUpdateRef = useRef<boolean>(false);
  const { syncGraphToYaml } = useYamlSync({ yamlText, setYamlText, setRoadmaps, selectedRoadmapId, ignoreYamlUpdateRef });
  const { onEdgeClick } = useEdgeSelection({ setEdges, nodes, syncGraphToYaml });

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

  const onLabelChange = useCallback(
    (id: string, newLabel: string) => {
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
    },
    [setNodes, syncGraphToYaml]
  );

  const onToggleFinished = useCallback(
    (id: string, finished: boolean) => {
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
    },
    [setNodes, syncGraphToYaml]
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

  const onEditClick = useCallback((id: string) => {
    setNodes((nds) => {
      const node = nds.find((n) => n.id === id);
      if (node) {
        setEditingNodeId(id);
        setEditTitle(node.data.label || '');
        setEditDetail(node.data.description || '');
        setEditUrl(node.data.url || '');
        setEditLessons(node.data.lessons || []);
        setEditTests(node.data.tests || []);
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
              lessons: editLessons,
              tests: editTests,
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
    onGoToLesson,
    onGoToTest,
    ignoreYamlUpdateRef,
  });

  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, showDescription: showDetails },
      }))
    );
  }, [showDetails, setNodes]);

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

  const onAutoAlign = useAutoLayout(nodes, edges, setNodes, syncGraphToYaml);
  const currentProgress = calculateCompleteness(yamlText);

  return (
    <div className="roadmap-page">
      <RoadmapSidebar
        roadmaps={roadmaps}
        selectedRoadmapId={selectedRoadmapId}
        onSelectRoadmap={selectRoadmap}
        onCreateRoadmap={onCreateRoadmap}
        onSaveRoadmap={saveRoadmap}
        yamlVisible={yamlVisible}
        setYamlVisible={setYamlVisible}
      />

      {yamlVisible && (
        <div className="yaml-panel" style={{ width: `${leftWidth}px` }}>
          <div className="yaml-panel-header">📝 YAML Roadmap Editor</div>

          <div className="yaml-panel-body">
            <CodeEditor
              value={yamlText}
              language="yaml"
              placeholder="Please enter YAML code."
              onChange={(ev) => setYamlText(ev.target.value)}
              padding={15}
              className="yaml-editor"
              style={{
                fontSize: 14,
                backgroundColor: 'var(--yaml-editor-bg)',
                fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace',
                minHeight: '100%',
              }}
              data-color-mode={darkMode ? 'dark' : 'light'}
            />
          </div>

          {error && (
            <div className="yaml-error">
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>
      )}

      {yamlVisible && <div className="panel-resizer" onMouseDown={startResize} />}

      <div className="app-canvas">
        <div className="progress-hud">
          <span className="hud-title">🚀 Progress</span>
          <div className="hud-track">
            <div className="hud-fill" style={{ width: `${currentProgress}%` }} />
          </div>
          <span className="hud-percent">{currentProgress}%</span>
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

          <Panel position="top-right" className="rf-top-panel">
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
        editLessons={editLessons}
        setEditLessons={setEditLessons}
        editTests={editTests}
        setEditTests={setEditTests}
        editSubTreeId={editSubTreeId}
        setEditSubTreeId={setEditSubTreeId}
        roadmaps={roadmaps}
        availableLessons={getLessonPickerOptions()}
        availableTests={getTestPickerOptions()}
        onGoToLesson={onGoToLesson}
        onGoToTest={onGoToTest}
        onSave={saveNodeEdits}
      />
    </div>
  );
}

export default Roadmap;
