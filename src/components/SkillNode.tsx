import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';

interface SkillNodeData {
  label: string;
  description?: string;
  finished?: boolean;
  url?: string;
  quizUrl?: string;
  subTreeId?: string;
  showDescription: boolean;
  onLabelChange: (id: string, newLabel: string) => void;
  onToggleFinished: (id: string, finished: boolean) => void;
  onEditClick: (id: string) => void;
  onGoToSubTree: (id: string) => void;
}

export function SkillNode({ id, data, selected }: NodeProps<SkillNodeData>) {
  return (
    <div
      style={{
        background: selected ? '#eef2ff' : data.finished ? '#eefbf4' : '#ffffff',
        color: '#1a1a1a',
        border: selected ? '2.5px solid #1d4ed8' : data.finished ? '2.5px solid #2e7d32' : '2.5px solid #646cff',
        borderRadius: '10px',
        padding: '12px 16px',
        fontWeight: '600',
        fontSize: '14px',
        width: 'max-content',
        maxWidth: '280px',
        wordBreak: 'break-word',
        textAlign: 'center',
        position: 'relative',
        boxShadow: selected
          ? '0 10px 20px -4px rgba(29, 78, 216, 0.28), 0 4px 8px -2px rgba(0, 0, 0, 0.08)'
          : data.finished
            ? '0 8px 16px -2px rgba(46, 125, 50, 0.15), 0 4px 6px -1px rgba(0, 0, 0, 0.05)'
            : '0 8px 16px -2px rgba(100, 108, 255, 0.15), 0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        transition: 'all 0.3s',
        outline: selected ? '3px solid rgba(29, 78, 216, 0.18)' : 'none',
      }}
    >
      <div style={{ position: 'absolute', top: '6px', left: '8px', zIndex: 10 }}>
        <input
          type="checkbox"
          checked={!!data.finished}
          onChange={(e) => data.onToggleFinished(id, e.target.checked)}
          style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#2e7d32' }}
          title="Mark as completed"
        />
      </div>

      <div style={{ position: 'absolute', top: '4px', right: '4px', display: 'flex', gap: '3px', zIndex: 10 }}>
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
      </div>

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

      {data.subTreeId && (
        <div style={{ marginTop: '6px' }}>
          <button
            onClick={() => data.subTreeId && data.onGoToSubTree(data.subTreeId)}
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

      <Handle
        type="target"
        position={Position.Top}
        id="target"
        style={{
          background: data.finished ? '#2e7d32' : '#646cff',
          width: '10px',
          height: '10px',
          border: '2px solid #ffffff',
        }}
        isConnectable={true}
        title="Previous Skill (Connect to here)"
      />

      <Handle
        type="source"
        position={Position.Bottom}
        id="source"
        style={{
          background: data.finished ? '#2e7d32' : '#646cff',
          width: '10px',
          height: '10px',
          border: '2px solid #ffffff',
        }}
        isConnectable={true}
        title="Next Skill (Drag from here)"
      />
    </div>
  );
}
