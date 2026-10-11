import { CategorySection } from './components/Sidebar/ContentTreeSidebar';
import { Sidebar } from './components/Sidebar/Sidebar';
import { LearntSummary } from './components/revision/LearntSummary';
import { RevisionSessionView } from './components/revision/RevisionSessionView';
import { useRevisionData } from './hooks/useRevisionData';
import { useRevisionSession } from './hooks/useRevisionSession';

function Revision() {
  const { completedRows, setCompletedRows, dueCount, nextRevisionIso, fetchCompleted, fetchDueCount } = useRevisionData();
  const session = useRevisionSession({ completedRows, setCompletedRows, fetchCompleted, fetchDueCount });

  return (
    <div className="tests-page">
      <Sidebar>
        <div className="tests-sidebar-header">
          <div className="tests-sidebar-title">Revision</div>
        </div>
        <CategorySection title="Revision Actions">
          <div className="revision-action-list">
            <button type="button" className="toolbar-btn toolbar-btn--full" onClick={() => { void session.showLearntSummary(); }}>
              Learnt Summary
            </button>
            <button type="button" className="toolbar-btn toolbar-btn--full" onClick={() => { void session.startRevision(); }}>
              Start Revision
            </button>
          </div>
        </CategorySection>
      </Sidebar>

      <div className="tests-content">
        {session.showSummary && !session.revisionMode ? (
          <LearntSummary
            completedRows={completedRows}
            dueCount={dueCount}
            nextRevisionIso={nextRevisionIso}
            onStartRevision={() => { void session.startRevision(); }}
            onDataImported={async () => {
              await fetchCompleted();
              await fetchDueCount();
            }}
          />
        ) : session.revisionMode ? (
          <RevisionSessionView session={session} />
        ) : null}
      </div>
    </div>
  );
}

export default Revision;
