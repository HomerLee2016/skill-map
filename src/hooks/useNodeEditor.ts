import { useCallback, useState } from 'react';
import type { Edge, Node } from 'reactflow';

type SetNodes = React.Dispatch<React.SetStateAction<Node[]>>;
type SetEdges = React.Dispatch<React.SetStateAction<Edge[]>>;

interface NodeEditorDeps {
  setNodes: SetNodes;
  setEdges: SetEdges;
  syncGraphToYaml: (nodes: Node[], edges: Edge[]) => void;
}

export function useNodeEditor({ setNodes, setEdges, syncGraphToYaml }: NodeEditorDeps) {
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDetail, setEditDetail] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editLessons, setEditLessons] = useState<string[]>([]);
  const [editTests, setEditTests] = useState<string[]>([]);
  const [editSubTreeId, setEditSubTreeId] = useState('');

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

  return {
    onEditClick,
    saveNodeEdits,
    modalProps: {
      editingNodeId, setEditingNodeId,
      editTitle, setEditTitle,
      editDetail, setEditDetail,
      editUrl, setEditUrl,
      editLessons, setEditLessons,
      editTests, setEditTests,
      editSubTreeId, setEditSubTreeId,
    },
  };
}
