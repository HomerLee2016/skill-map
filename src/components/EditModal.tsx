// src/components/EditModal.tsx
import React, { useState } from 'react';

interface ContentOption {
  id: string;
  title: string;
}

interface EditModalProps {
  editingNodeId: string | null;
  setEditingNodeId: (id: string | null) => void;
  editTitle: string;
  setEditTitle: (v: string) => void;
  editDetail: string;
  setEditDetail: (v: string) => void;
  editUrl: string;
  setEditUrl: (v: string) => void;
  editLessons: string[];
  setEditLessons: (v: string[]) => void;
  editTests: string[];
  setEditTests: (v: string[]) => void;
  editSubTreeId: string;
  setEditSubTreeId: (v: string) => void;
  roadmaps: { id: string; name: string }[];
  availableLessons: ContentOption[];
  availableTests: ContentOption[];
  onGoToLesson: (id: string) => void;
  onGoToTest: (id: string) => void;
  onSave: () => void;
}

function LinkedContentList({
  label,
  linkedIds,
  available,
  onAdd,
  onRemove,
  onOpen,
  emptyHint,
}: {
  label: string;
  linkedIds: string[];
  available: ContentOption[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onOpen: (id: string) => void;
  emptyHint: string;
}) {
  const [picking, setPicking] = useState(false);

  const byId = new Map(available.map((item) => [item.id, item]));
  const unlinked = available.filter((item) => !linkedIds.includes(item.id));

  return (
    <div className="modal-link-group">
      <div className="modal-link-header">
        <span className="modal-label">{label}</span>
        <button
          type="button"
          className="modal-link-add"
          title={`Link an existing ${label.toLowerCase().slice(0, -1)}`}
          disabled={unlinked.length === 0}
          onClick={() => setPicking((open) => !open)}
        >
          +
        </button>
      </div>

      {picking && unlinked.length > 0 && (
        <select
          className="modal-input"
          defaultValue=""
          onChange={(e) => {
            const id = e.target.value;
            if (id) {
              onAdd(id);
              setPicking(false);
            }
          }}
        >
          <option value="">Select {label.toLowerCase().slice(0, -1)} to link…</option>
          {unlinked.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} ({item.id})
            </option>
          ))}
        </select>
      )}

      {linkedIds.length === 0 ? (
        <p className="modal-link-empty">{emptyHint}</p>
      ) : (
        linkedIds.map((id) => {
          const item = byId.get(id);
          const title = item?.title || id;
          return (
            <div key={id} className="modal-link-row">
              <button type="button" className="modal-link-name" onClick={() => onOpen(id)} title={`Open ${title}`}>
                {title}
              </button>
              <button
                type="button"
                className="modal-link-remove"
                title="Remove link"
                onClick={() => onRemove(id)}
              >
                🗑️
              </button>
            </div>
          );
        })
      )}
    </div>
  );
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
  editLessons,
  setEditLessons,
  editTests,
  setEditTests,
  editSubTreeId,
  setEditSubTreeId,
  roadmaps,
  availableLessons,
  availableTests,
  onGoToLesson,
  onGoToTest,
  onSave,
}) => {
  if (!editingNodeId) return null;

  const navigateToLesson = (id: string) => {
    setEditingNodeId(null);
    onGoToLesson(id);
  };

  const navigateToTest = (id: string) => {
    setEditingNodeId(null);
    onGoToTest(id);
  };

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

        <LinkedContentList
          label="Lessons"
          linkedIds={editLessons}
          available={availableLessons}
          onAdd={(id) => setEditLessons([...editLessons, id])}
          onRemove={(id) => setEditLessons(editLessons.filter((item) => item !== id))}
          onOpen={navigateToLesson}
          emptyHint="No lessons linked. Click + to link an existing lesson."
        />

        <LinkedContentList
          label="Tests"
          linkedIds={editTests}
          available={availableTests}
          onAdd={(id) => setEditTests([...editTests, id])}
          onRemove={(id) => setEditTests(editTests.filter((item) => item !== id))}
          onOpen={navigateToTest}
          emptyHint="No tests linked. Click + to link an existing test."
        />

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
