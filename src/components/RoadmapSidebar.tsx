import type { SavedRoadmap } from '../types';

interface RoadmapSidebarProps {
  roadmaps: SavedRoadmap[];
  selectedRoadmapId: string;
  onSelectRoadmap: (id: string) => void;
  onCreateRoadmap: () => void;
  onSaveRoadmap: () => void;
  yamlVisible: boolean;
  setYamlVisible: (value: boolean) => void;
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
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
  yamlVisible,
  setYamlVisible,
  darkMode,
  setDarkMode,
}: RoadmapSidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">Roadmaps</div>
        <button className="sidebar-save-btn" onClick={onSaveRoadmap}>
          Save Roadmap
        </button>
        <div className="sidebar-toggles">
          <ToggleSwitch checked={yamlVisible} onChange={setYamlVisible} label="Show YAML" />
          <ToggleSwitch checked={darkMode} onChange={setDarkMode} label="Dark mode" />
        </div>
      </div>
      {roadmaps.map((r) => (
        <button
          key={r.id}
          className={
            selectedRoadmapId === r.id
              ? 'sidebar-item sidebar-item--selected'
              : 'sidebar-item'
          }
          onClick={() => onSelectRoadmap(r.id)}
        >
          {r.name}
        </button>
      ))}
      <button className="sidebar-create-btn" onClick={onCreateRoadmap}>
        + New Roadmap
      </button>
    </div>
  );
}
