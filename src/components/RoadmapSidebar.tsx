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
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none', fontSize: '12px' }}>
      <span>{label}</span>
      <span
        style={{
          position: 'relative',
          width: '42px',
          height: '22px',
          borderRadius: '999px',
          background: checked ? '#4e9afe' : '#555',
          transition: 'background 0.2s ease',
          flex: '0 0 auto',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0,
            cursor: 'pointer',
            margin: 0,
          }}
        />
        <span
          style={{
            position: 'absolute',
            top: '2px',
            left: checked ? '22px' : '2px',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
            transition: 'left 0.2s ease',
          }}
        />
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
    <div
      className="sidebar"
      style={{
        width: 250,
        background: darkMode ? '#111' : '#f5f7fb',
        color: darkMode ? '#fff' : '#111',
        overflowY: 'auto',
        position: 'relative',
        borderRight: `1px solid ${darkMode ? '#2a2a2a' : '#d9e0ea'}`,
      }}
    >
      <div style={{ padding: '12px 12px 8px', borderBottom: `1px solid ${darkMode ? '#2a2a2a' : '#d9e0ea'}` }}>
        <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '10px' }}>Roadmaps</div>
        <button
          onClick={onSaveRoadmap}
          style={{
            width: '100%',
            padding: '10px',
            background: '#2e7d32',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            marginBottom: '10px',
            fontWeight: 700,
          }}
        >
          Save Roadmap
        </button>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <ToggleSwitch checked={yamlVisible} onChange={setYamlVisible} label="Show YAML" />
          <ToggleSwitch checked={darkMode} onChange={setDarkMode} label="Dark mode" />
        </div>
      </div>
      {roadmaps.map((r) => (
        <button
          key={r.id}
          onClick={() => onSelectRoadmap(r.id)}
          style={{
            width: '100%',
            padding: '10px',
            background: selectedRoadmapId === r.id ? (darkMode ? '#222' : '#e6eefc') : 'transparent',
            color: darkMode ? '#fff' : '#111',
            border: 'none',
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          {r.name}
        </button>
      ))}
      <button
        onClick={onCreateRoadmap}
        style={{
          width: '100%',
          padding: '10px',
          background: darkMode ? '#222' : '#eef3f8',
          color: darkMode ? '#fff' : '#111',
          border: `1px dashed ${darkMode ? '#444' : '#c7d2e2'}`,
          marginTop: '10px',
          cursor: 'pointer',
        }}
      >
        + New Roadmap
      </button>
    </div>
  );
}
