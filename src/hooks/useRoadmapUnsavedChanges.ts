import { useEffect, useRef, useState } from 'react';

export function useRoadmapUnsavedChanges(
  yamlText: string,
  initialYaml: string,
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void,
) {
  const lastSavedYamlRef = useRef<string>(initialYaml);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    const hasChanges = yamlText !== lastSavedYamlRef.current;
    setHasUnsavedChanges(hasChanges);
    onUnsavedChangesChange?.(hasChanges);
  }, [yamlText, onUnsavedChangesChange]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  return { hasUnsavedChanges, setHasUnsavedChanges, lastSavedYamlRef };
}
