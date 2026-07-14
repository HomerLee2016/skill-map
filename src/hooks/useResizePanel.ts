import { useState, useRef, useCallback } from 'react';

/**
 * Hook that provides a resizable left panel width and mouse handlers.
 * The panel starts at `initialWidth` (default 450px) and cannot be reduced
 * below 200px or exceed 70% of the window width.
 */
export const useResizePanel = (initialWidth = 450) => {
  const [leftWidth, setLeftWidth] = useState<number>(initialWidth);
  const isDragging = useRef<boolean>(false);

  const resizePanel = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const sidebarWidth = 250; // fixed sidebar width
    const newWidth = Math.max(200, Math.min(e.clientX - sidebarWidth, window.innerWidth * 0.7));
    setLeftWidth(newWidth);
  }, []);

  const stopResize = useCallback(() => {
    isDragging.current = false;
    document.removeEventListener('mousemove', resizePanel);
    document.removeEventListener('mouseup', stopResize);
  }, [resizePanel]);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.addEventListener('mousemove', resizePanel);
    document.addEventListener('mouseup', stopResize);
  }, [resizePanel, stopResize]);

  return { leftWidth, setLeftWidth, startResize };
};
