import React, { useRef } from 'react';
import type { SavedRoadmap } from '../types';

interface RoadmapSidebarProps {
  roadmaps: SavedRoadmap[];
  selectedRoadmapId: string;
  onSelectRoadmap: (id: string) => void;
  onCreateRoadmap: () => void;
}

export function RoadmapSidebar({
  roadmaps,
  selectedRoadmapId,
  onSelectRoadmap,
  onCreateRoadmap,
}: RoadmapSidebarProps) {
  const isDragging = useRef(false);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = Math.max(200, Math.min(ev.clientX - 200, window.innerWidth * 0.7));
      setLeftWidth(newWidth);
    };
    const onMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

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
      {/* Resize handle removed; resizing now controls YAML area only */}
    </div>
  );
}
