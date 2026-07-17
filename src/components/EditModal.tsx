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
    <div className="modal-overlay">
      <div className="modal-dialog">
        <h3 className="modal-title">✏️ Edit Skill Node</h3>
        <label className="modal-label">
          Title
          <input
            type="text"
            className="modal-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
        </label>
        <label className="modal-label">
          Detail Description
          <textarea
            className="modal-input modal-textarea"
            value={editDetail}
            onChange={(e) => setEditDetail(e.target.value)}
          />
        </label>
        <label className="modal-label">
          Resource URL
          <input
            type="text"
            className="modal-input"
            value={editUrl}
            onChange={(e) => setEditUrl(e.target.value)}
            placeholder="https://example.com"
          />
        </label>
        <label className="modal-label">
          Quiz/Homework URL
          <input
            type="text"
            className="modal-input"
            value={editQuizUrl}
            onChange={(e) => setEditQuizUrl(e.target.value)}
            placeholder="https://quiz-resource.com"
          />
        </label>
        <label className="modal-label">
          Link to Sub-Tree Roadmap
          <select
            className="modal-input"
            value={editSubTreeId}
            onChange={(e) => setEditSubTreeId(e.target.value)}
          >
            <option value="">-- None --</option>
            {roadmaps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={() => setEditingNodeId(null)}>
            Cancel
          </button>
          <button className="modal-btn-save" onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
