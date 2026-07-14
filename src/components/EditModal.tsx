// src/components/EditModal.tsx
import React from 'react';

interface EditModalProps {
  editingNodeId: string | null;
  setEditingNodeId: (id: string | null) => void;
  editTitle: string;
  setEditTitle: (v: string) => void;
  editDetail: string;
  setEditDetail: (v: string) => void;
  editUrl: string;
  setEditUrl: (v: string) => void;
  editQuizUrl: string;
  setEditQuizUrl: (v: string) => void;
  editSubTreeId: string;
  setEditSubTreeId: (v: string) => void;
  roadmaps: { id: string; name: string }[];
  onSave: () => void;
}

export const EditModal: React.FC<EditModalProps> = ({
  editingNodeId,
  setEditingNodeId,
  editTitle,
  setEditTitle,
  editDetail,
  setEditDetail,
  editUrl,
  setEditUrl,
  editQuizUrl,
  setEditQuizUrl,
  editSubTreeId,
  setEditSubTreeId,
  roadmaps,
  onSave,
}) => {
  if (!editingNodeId) return null;
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '8px',
          padding: '24px',
          width: '400px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '18px', color: '#333' }}>✏️ Edit Skill Node</h3>
        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555' }}>
          Title
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              marginTop: '4px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              boxSizing: 'border-box',
            }}
          />
        </label>
        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555' }}>
          Detail Description
          <textarea
            value={editDetail}
            onChange={(e) => setEditDetail(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              marginTop: '4px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              boxSizing: 'border-box',
              height: '60px',
              fontFamily: 'inherit',
            }}
          />
        </label>
        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555' }}>
          Resource URL
          <input
            type="text"
            value={editUrl}
            onChange={(e) => setEditUrl(e.target.value)}
            placeholder="https://example.com"
            style={{
              width: '100%',
              padding: '8px',
              marginTop: '4px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              boxSizing: 'border-box',
            }}
          />
        </label>
        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555' }}>
          Quiz/Homework URL
          <input
            type="text"
            value={editQuizUrl}
            onChange={(e) => setEditQuizUrl(e.target.value)}
            placeholder="https://quiz-resource.com"
            style={{
              width: '100%',
              padding: '8px',
              marginTop: '4px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              boxSizing: 'border-box',
            }}
          />
        </label>
        <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555' }}>
          Link to Sub-Tree Roadmap
          <select
            value={editSubTreeId}
            onChange={(e) => setEditSubTreeId(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              marginTop: '4px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              boxSizing: 'border-box',
            }}
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
            onClick={onSave}
            style={{ padding: '8px 16px', background: '#646cff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
