import React, { useState } from "react";
import "./Sidebar.css";

interface SidebarProps {
  /** Content to render inside the sidebar (e.g., RoadmapSidebar, ContentTreeSidebar) */
  children: React.ReactNode;
  /** Optional initial visibility; defaults to true */
  defaultVisible?: boolean;
}

const MOBILE_QUERY = "(max-width: 768px)";

// Sidebar starts hidden on mobile so the page content gets the full width.
const isMobileViewport = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(MOBILE_QUERY).matches;

// Updated Sidebar component with conditional wrapper class
export const Sidebar: React.FC<SidebarProps> = ({ children, defaultVisible = true }) => {
  const [visible, setVisible] = useState(defaultVisible && !isMobileViewport());
  const toggle = () => setVisible(!visible);

  const wrapperClass = `sidebar-wrapper ${visible ? 'sidebar--open' : 'sidebar--closed'}`;

  return (
    <div className={wrapperClass}>
      {/* The actual sidebar – slides in/out */}
      <aside
        className={`sidebar ${visible ? "sidebar--open" : "sidebar--closed"}`}
        onClick={(event) => {
          // On phones the drawer covers the content, so picking an item should reveal it.
          if (isMobileViewport() && (event.target as Element).closest("[data-closes-mobile-sidebar]")) setVisible(false);
        }}
      >
        {children}
      </aside>
      {/* Toggle button – positioned at the right edge of the sidebar wrapper, always visible */}
      <button className="sidebar-toggle" onClick={toggle} aria-label="Toggle sidebar">
        {visible ? "❮" : "❯"}
      </button>
    </div>
  );
};
