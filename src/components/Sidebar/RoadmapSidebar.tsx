import type { SavedRoadmap } from '../../types';
import { DeleteIconButton } from '../editor/ContentActions';

interface RoadmapSidebarProps {
  roadmaps: SavedRoadmap[];
  selectedRoadmapId: string;
  onSelectRoadmap: (id: string) => void;
  onCreateRoadmap: () => void;
  onSaveRoadmap: () => void;
  onDeleteRoadmap: () => void;
  /** Why deleting is not possible right now, or null. */
  deleteBlockedReason: string | null;
  yamlVisible: boolean;
  setYamlVisible: (value: boolean) => void;
}

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="toggle-switch">
      <span>{label}</span>
      <span className={checked ? 'toggle-track toggle-track--on' : 'toggle-track'}>
        <input
          type="checkbox"
          className="toggle-input"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="toggle-knob" />
      </span>
    </label>
  );
}

export function RoadmapSidebar({
  roadmaps,
  selectedRoadmapId,
  onSelectRoadmap,
  onCreateRoadmap,
  onSaveRoadmap,
  onDeleteRoadmap,
  deleteBlockedReason,
  yamlVisible,
  setYamlVisible,
}: RoadmapSidebarProps) {
  return (
    <>
        <div className="sidebar-header">
          <div className="sidebar-title">Roadmaps</div>
          <button type="button" className="toolbar-btn toolbar-btn--primary toolbar-btn--full" onClick={onSaveRoadmap}>
            Save Roadmap
          </button>
          <button type="button" className="toolbar-btn toolbar-btn--full" onClick={onCreateRoadmap}>
            + New Roadmap
          </button>
          <div className="sidebar-toggles">
            <ToggleSwitch checked={yamlVisible} onChange={setYamlVisible} label="Show YAML" />
          </div>
        </div>
        {roadmaps.map((r) => (
          <div key={r.id} className={selectedRoadmapId === r.id ? 'sidebar-item-row sidebar-item-row--selected' : 'sidebar-item-row'}>
            <button
              type="button"
              className={
                selectedRoadmapId === r.id
                  ? 'sidebar-item sidebar-item--selected'
                  : 'sidebar-item'
              }
              onClick={() => onSelectRoadmap(r.id)}
            >
              {r.name}
            </button>
            {selectedRoadmapId === r.id ? (
              <DeleteIconButton noun="roadmap" blockedReason={deleteBlockedReason} onDelete={onDeleteRoadmap} />
            ) : null}
          </div>
        ))}
      </>
  );
}
