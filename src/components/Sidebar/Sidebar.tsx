import React, { useState } from "react";
import "./Sidebar.css";

interface SidebarProps {
  /** Content to render inside the sidebar (e.g., RoadmapSidebar, ContentTreeSidebar) */
  children: React.ReactNode;
  /** Optional initial visibility; defaults to true */
  defaultVisible?: boolean;
}

// Updated Sidebar component with conditional wrapper class
export const Sidebar: React.FC<SidebarProps> = ({ children, defaultVisible = true }) => {
  const [visible, setVisible] = useState(defaultVisible);
  const toggle = () => setVisible(!visible);

  const wrapperClass = `sidebar-wrapper ${visible ? 'sidebar--open' : 'sidebar--closed'}`;

  return (
    <div className={wrapperClass}>
      {/* The actual sidebar – slides in/out */}
      <aside className={`sidebar ${visible ? "sidebar--open" : "sidebar--closed"}`}>
        {children}
      </aside>
      {/* Toggle button – positioned at the right edge of the sidebar wrapper, always visible */}
      <button className="sidebar-toggle" onClick={toggle} aria-label="Toggle sidebar">
        {visible ? "❮" : "❯"}
      </button>
    </div>
  );
};
