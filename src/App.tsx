import { useState, useEffect, useRef } from 'react';
import YAML from 'yaml';
import CodeEditor from '@uiw/react-textarea-code-editor';
import ReactFlow, { 
  Background, 
  Controls, 
  MarkerType,
  type Node,  
  type Edge   
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { RoadmapNode } from './types';

const DEFAULT_YAML = `id: calculus
label: Calculus Roadmap
description: Complete guide to mastering Calculus
children:
  - id: algebra
    label: Basic Algebra
  - id: limits
    label: Limits
    children:
      - id: sandwich
        label: Sandwich Theorem
  - id: derivatives
    label: Derivatives
  - id: integrals
    label: Integrals`;

export default function App() {
  const [yamlText, setYamlText] = useState<string>(DEFAULT_YAML);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Custom Resizer States
  const [leftWidth, setLeftWidth] = useState<number>(450); // Initial width in pixels
  const isDragging = useRef<boolean>(false);

  // Handle Dragging Events for Layout Resize
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.addEventListener('mousemove', resizePanel);
    document.addEventListener('mouseup', stopResize);
  };

  const resizePanel = (e: MouseEvent) => {
    if (!isDragging.current) return;
    // Keep width constraints between 250px and 70% of total viewport window
    const newWidth = Math.max(250, Math.min(e.clientX, window.innerWidth * 0.7));
    setLeftWidth(newWidth);
  };

  const stopResize = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', resizePanel);
    document.removeEventListener('mouseup', stopResize);
  };

  useEffect(() => {
    try {
      const parsed = YAML.parse(yamlText) as RoadmapNode;
      if (!parsed || !parsed.id) {
        throw new Error("YAML must contain at least a root node with an 'id' and 'label'.");
      }

      const generatedNodes: Node[] = [];
      const generatedEdges: Edge[] = [];

      const traverse = (
        node: RoadmapNode, 
        parentId: string | null = null, 
        depth = 0, 
        index = 0
      ) => {
        const nodeId = node.id;
        const position = { 
          x: index * 250 + 50, 
          y: depth * 120 + 50 
        };

        generatedNodes.push({
          id: nodeId,
          data: { label: node.label },
          position,
          style: {
            background: '#fff',
            color: '#333',
            border: '1px solid #1a1a1a',
            borderRadius: '8px',
            padding: '10px',
            fontWeight: 'bold',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }
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
  }, [yamlText]);

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

      {/* RIGHT SIDE: Visual Tree Graph (Flex 1 absorbs remaining width) */}
      <div style={{ flex: 1, height: '100%', backgroundColor: '#f9f9f9', position: 'relative' }}>
        <ReactFlow nodes={nodes} edges={edges} fitView>
          <Background color="#ccc" gap={16} />
          <Controls />
        </ReactFlow>
      </div>

    </div>
  );
}