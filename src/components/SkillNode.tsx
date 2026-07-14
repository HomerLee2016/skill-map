import React from 'react';
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
  onDelete: (id: string) => void;
  onEditClick: (id: string) => void;
  onGoToSubTree: (id: string) => void;
}

export function SkillNode({ id, data }: NodeProps<SkillNodeData>) {
  return (
    <div
      style={{
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
        transition: 'all 0.3s',
      }}
    >
      {/* Top Left: Checkbox for progress */}
      <div style={{ position: 'absolute', top: '6px', left: '8px', zIndex: 10 }}>
        <input
          type="checkbox"
          checked={!!data.finished}
          onChange={e => data.onToggleFinished(id, e.target.checked)}
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
            onClick={e => e.stopPropagation()}
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
            onClick={e => e.stopPropagation()}
            style={{ textDecoration: 'none', fontSize: '13px' }}
            title="Take external homework/quiz"
          >
            📝
          </a>
        )}
      </div>

      {/* Top Handle - Previous Skill (Target) */}
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

      {/* Bottom Handle - Next Skill (Source) */}
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
