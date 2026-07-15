import type { SavedRoadmap } from '../types';

interface RoadmapSidebarProps {
  roadmaps: SavedRoadmap[];
  selectedRoadmapId: string;
  onSelectRoadmap: (id: string) => void;
  onCreateRoadmap: () => void;
  onSaveRoadmap: () => void;
  yamlVisible: boolean;
  setYamlVisible: (value: boolean) => void;
}

export function RoadmapSidebar({
  roadmaps,
  selectedRoadmapId,
  onSelectRoadmap,
  onCreateRoadmap,
  onSaveRoadmap,
  yamlVisible,
  setYamlVisible,
}: RoadmapSidebarProps) {
  return (
    <div
      className="sidebar"
      style={{
        width: 250, // fixed sidebar width
        background: '#111',
        color: '#fff',
        overflowY: 'auto',
        position: 'relative',
      }}
    >
      <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid #2a2a2a' }}>
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
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={yamlVisible}
            onChange={(e) => setYamlVisible(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Show YAML
        </label>
      </div>
      {roadmaps.map((r) => (
        <button
          key={r.id}
          onClick={() => onSelectRoadmap(r.id)}
          style={{
            width: '100%',
            padding: '10px',
            background: selectedRoadmapId === r.id ? '#222' : 'transparent',
            color: '#fff',
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
          background: '#222',
          color: '#fff',
          border: '1px dashed #444',
          marginTop: '10px',
          cursor: 'pointer',
        }}
      >
        + New Roadmap
      </button>
    </div>
  );
}
