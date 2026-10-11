import ReactFlow, {
  Background,
  Controls,
  Panel,
  SelectionMode,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { SkillNode } from '../SkillNode';
import { Toolbar } from '../Toolbar';

const nodeTypes = {
  skillNode: SkillNode,
};

interface RoadmapCanvasProps {
  nodes: Node[];
  edges: Edge[];
  progress: number;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onNodesDelete: (nodes: Node[]) => void;
  onConnect: (params: any) => void;
  onPersistPositions: () => void;
  onEdgeClick: (event: React.MouseEvent, edge: Edge) => void;
  toolbar: React.ComponentProps<typeof Toolbar>;
}

export function RoadmapCanvas({
  nodes, edges, progress, onNodesChange, onEdgesChange, onNodesDelete, onConnect, onPersistPositions, onEdgeClick, toolbar,
}: RoadmapCanvasProps) {
  return (
    <div className="app-canvas">
      <div className="progress-hud">
        <span className="hud-title">🚀 Progress</span>
        <div className="hud-track">
          <div className="hud-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="hud-percent">{progress}%</span>
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
        onNodeDragStop={onPersistPositions}
        onSelectionDragStop={onPersistPositions}
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
          <Toolbar {...toolbar} />
        </Panel>
      </ReactFlow>
    </div>
  );
}
