import { useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { getAllCompletedQuestions, getDueRevisionQuestions } from '../services/revisionDb';
import { getNextRevisionIso } from '../utils/revisionSession';

export function useRevisionData() {
  const { selectedDirectoryHandle, workspaceSelectionLabel, workspaceVersion } = useWorkspace();
  const [completedRows, setCompletedRows] = useState<any[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const nextRevisionIso = useMemo(() => getNextRevisionIso(completedRows), [completedRows]);

  const fetchCompleted = async () => {
    try {
      const data = await getAllCompletedQuestions();
      setCompletedRows(data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchDueCount = async () => {
    try {
      const data = await getDueRevisionQuestions();
      setDueCount(data.length);
      return data.length;
    } catch (error) {
      console.error(error);
      return 0;
    }
  };

  useEffect(() => {
    void fetchCompleted();
    void fetchDueCount();
  }, [workspaceVersion, selectedDirectoryHandle?.name, workspaceSelectionLabel]);

  return { completedRows, setCompletedRows, dueCount, nextRevisionIso, fetchCompleted, fetchDueCount };
}
