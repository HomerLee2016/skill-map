import { useState, useEffect, useRef } from 'react';
import { useNodesState, useEdgesState } from 'reactflow';
import type { SavedRoadmap } from './types';

import { EditModal } from './components/EditModal';
import { RoadmapCanvas } from './components/roadmap/RoadmapCanvas';
import { YamlEditorPanel } from './components/roadmap/YamlEditorPanel';
import { useGraphParser } from './hooks/useGraphParser';
import { useGraphEdits } from './hooks/useGraphEdits';
import { useNodeEditor } from './hooks/useNodeEditor';
import { useResizePanel } from './hooks/useResizePanel';
import { useEdgeSelection } from './hooks/useEdgeSelection';
import { useRoadmapUnsavedChanges } from './hooks/useRoadmapUnsavedChanges';
import { useYamlSync } from './hooks/useYamlSync';
import { useAutoLayout } from './hooks/useAutoLayout';
import { RoadmapSidebar } from './components/Sidebar/RoadmapSidebar';
import { Sidebar } from './components/Sidebar/Sidebar';
import { useWorkspace } from './contexts/WorkspaceContext';
import { writeWorkspaceRoadmapFile } from './services/workspaceRoadmapPersistence';
import { calculateCompleteness, getRoadmapLabel } from './utils/roadmapYaml';

interface RoadmapProps {
  darkMode: boolean;
  onGoToLesson: (id: string) => void;
  onGoToTest: (id: string) => void;
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
}

function Roadmap({ darkMode, onGoToLesson, onGoToTest, onUnsavedChangesChange }: RoadmapProps) {
  const { workspace, workspaceVersion, selectedDirectoryHandle } = useWorkspace();
  const [roadmaps, setRoadmaps] = useState<SavedRoadmap[]>(() => workspace.roadmaps);
  const [selectedRoadmapId, setSelectedRoadmapId] = useState<string>(() => workspace.roadmaps[0]?.id || 'untitled');
  const [yamlText, setYamlText] = useState<string>(() => workspace.roadmaps[0]?.yaml || '');
  const [yamlVisible, setYamlVisible] = useState<boolean>(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<boolean>(true);
  const [tipsOpen, setTipsOpen] = useState<boolean>(true);
  const { hasUnsavedChanges, setHasUnsavedChanges, lastSavedYamlRef } = useRoadmapUnsavedChanges(
    yamlText,
    workspace.roadmaps[0]?.yaml || '',
    onUnsavedChangesChange,
  );

  useEffect(() => {
    if (workspace.roadmaps.length === 0) {
      setRoadmaps([]);
      setSelectedRoadmapId('untitled');
      setYamlText('');
      return;
    }

    setRoadmaps(workspace.roadmaps);
    const nextId = workspace.roadmaps.some((roadmap) => roadmap.id === selectedRoadmapId)
      ? selectedRoadmapId
      : workspace.roadmaps[0]?.id || 'untitled';

    setSelectedRoadmapId(nextId);
    const selectedRoadmap = workspace.roadmaps.find((roadmap) => roadmap.id === nextId);
    if (selectedRoadmap) {
      setYamlText(selectedRoadmap.yaml);
      lastSavedYamlRef.current = selectedRoadmap.yaml;
    }
  }, [selectedRoadmapId, workspace.roadmaps, workspaceVersion, lastSavedYamlRef]);

  const { leftWidth, startResize } = useResizePanel();
  const ignoreYamlUpdateRef = useRef<boolean>(false);
  const { syncGraphToYaml } = useYamlSync({ yamlText, setYamlText, setRoadmaps, selectedRoadmapId, ignoreYamlUpdateRef });
  const { onEdgeClick } = useEdgeSelection({ setEdges, nodes, syncGraphToYaml });
  const { onEditClick, saveNodeEdits, modalProps } = useNodeEditor({ setNodes, setEdges, syncGraphToYaml });

  const selectRoadmap = (id: string) => {
    if (hasUnsavedChanges && !window.confirm('You have unsaved changes. Leave this roadmap and discard them?')) {
      return;
    }

    setSelectedRoadmapId(id);
    const target = roadmaps.find((r) => r.id === id);
    if (target) {
      setYamlText(target.yaml);
      lastSavedYamlRef.current = target.yaml;
      setHasUnsavedChanges(false);
    }
  };

  const saveRoadmap = async () => {
    try {
      const currentRoadmap = roadmaps.find((roadmap) => roadmap.id === selectedRoadmapId);
      if (!currentRoadmap) {
        setError('No roadmap selected');
        return;
      }

      const nextRoadmap: SavedRoadmap = {
        ...currentRoadmap,
        name: getRoadmapLabel(yamlText, currentRoadmap.name),
        yaml: yamlText,
      };

      setRoadmaps((prev) => prev.map((roadmap) => (roadmap.id === selectedRoadmapId ? nextRoadmap : roadmap)));
      lastSavedYamlRef.current = yamlText;
      setHasUnsavedChanges(false);
      onUnsavedChangesChange?.(false);
      const persisted = await writeWorkspaceRoadmapFile(selectedDirectoryHandle, nextRoadmap);
      if (!persisted) {
        throw new Error('Failed to save roadmap to workspace');
      }
      setError(null);
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

  const { onLabelChange, onToggleFinished, onNodesDelete, persistPositionsToYaml, onConnect, onCreateNode } = useGraphEdits({
    nodes, edges, setNodes, setEdges, syncGraphToYaml, showDetails, onEditClick, selectRoadmap, onGoToLesson, onGoToTest,
  });

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

  const onAutoAlign = useAutoLayout(nodes, edges, setNodes, syncGraphToYaml);

  return (
    <div className="roadmap-page">
      <Sidebar>
        <RoadmapSidebar
          roadmaps={roadmaps}
          selectedRoadmapId={selectedRoadmapId}
          onSelectRoadmap={selectRoadmap}
          onCreateRoadmap={onCreateRoadmap}
          onSaveRoadmap={saveRoadmap}
          yamlVisible={yamlVisible}
          setYamlVisible={setYamlVisible}
        />
      </Sidebar>

      {yamlVisible && (
        <YamlEditorPanel
          yamlText={yamlText}
          setYamlText={setYamlText}
          error={error}
          darkMode={darkMode}
          width={leftWidth}
          startResize={startResize}
        />
      )}

      <RoadmapCanvas
        nodes={nodes}
        edges={edges}
        progress={calculateCompleteness(yamlText)}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodesDelete={onNodesDelete}
        onConnect={onConnect}
        onPersistPositions={persistPositionsToYaml}
        onEdgeClick={onEdgeClick}
        toolbar={{ onAutoAlign, showDetails, setShowDetails, onAddNode: onCreateNode, tipsOpen, setTipsOpen }}
      />

      <EditModal
        {...modalProps}
        roadmaps={roadmaps}
        availableLessons={workspace.lessons.map(({ id, title }) => ({ id, label: title, path: '' }))}
        availableTests={workspace.tests.map(({ id, title }) => ({ id, label: title, path: '' }))}
        onGoToLesson={onGoToLesson}
        onGoToTest={onGoToTest}
        onSave={saveNodeEdits}
      />
    </div>
  );
}

export default Roadmap;
