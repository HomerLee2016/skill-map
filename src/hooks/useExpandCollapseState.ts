import { useState } from 'react';

export function useExpandCollapseState() {
  const [expandKey, setExpandKey] = useState(0);
  const [collapseKey, setCollapseKey] = useState(0);

  const expandAll = () => setExpandKey((k) => k + 1);
  const collapseAll = () => setCollapseKey((k) => k + 1);

  return { expandKey, collapseKey, expandAll, collapseAll };
}
