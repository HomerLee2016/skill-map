import { formatNextRevisionTime, formatProficiencyDisplay } from '../../utils/proficiency';
import { calcTotalStars, countStarLevels } from '../../utils/revisionSession';
import { useState } from 'react';
import { RevisionDataButtons } from './RevisionDataButtons';
import { RemoveRecordsDialog } from './RemoveRecordsDialog';

function StarStatsChart({ completedRows }: { completedRows: any[] }) {
  const starCounts = countStarLevels(completedRows);
  const maxCount = Math.max(0, ...Object.values(starCounts));
  return (
    <div className="star-stats-chart summary-highlight-block">
      <div className="star-chart-container">
        <div className="star-bar-group">
          {[1,2,3,4,5].map(level => {
            const count = starCounts[level] ?? 0;
            const heightPercent = maxCount ? (count / maxCount) * 100 : 0;
            // Ensure a minimal visible height (4%) for zero counts
            const displayHeight = Math.max(heightPercent, 4);
            return (

              <div key={level} className="star-bar-wrapper">
                <div className={`star-bar level-${level}`} style={{ height: `${displayHeight}%` }} />
                <div className="star-bar-count">{count}</div>
                <div className="star-bar-label">{level}⭐</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface LearntSummaryProps {
  completedRows: any[];
  dueCount: number;
  nextRevisionIso: string | null;
  onStartRevision: () => void;
  onDataImported: () => Promise<void>;
  /** Removes the records with these row ids (locally and, via sync, in the cloud). */
  onRemoveRecords: (ids: number[]) => Promise<void>;
}

export function LearntSummary({ completedRows, dueCount, nextRevisionIso, onStartRevision, onDataImported, onRemoveRecords }: LearntSummaryProps) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const selectedRows = completedRows.filter((row: any) => selected.has(row.id));
  const allSelected = completedRows.length > 0 && selectedRows.length === completedRows.length;

  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const toggle = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="revision-page-shell">
      <div className="revision-header-card">
        <div>
          <h1>Revision</h1>
          <p>You have {dueCount} question{dueCount !== 1 ? 's' : ''} due for review. { dueCount == 0 ? (nextRevisionIso ? 'Come back in ' + formatNextRevisionTime(nextRevisionIso) : '') : 'Let\'s review now.'}</p>
        </div>
        <button type="button" className="toolbar-btn" onClick={onStartRevision}>
          Start revision
        </button>
      </div>
      <div className="summary-table-wrapper">
        <div className="summary-table-header">
          <div>
            <h2>Learnt Summary</h2>
          </div>
          <div className="summary-table-header-buttons">
            {selecting ? (
              <>
                <button type="button" className="toolbar-btn remove-confirm remove-confirm--danger" disabled={selected.size === 0} onClick={() => setConfirming(true)}>
                  Remove{selected.size > 0 ? ` (${selected.size})` : ''}
                </button>
                <button type="button" className="toolbar-btn" onClick={stopSelecting}>Cancel</button>
              </>
            ) : (
              <>
                <button type="button" className="toolbar-btn" disabled={completedRows.length === 0} onClick={() => setSelecting(true)}>
                  Remove record
                </button>
                <RevisionDataButtons onImported={onDataImported} />
              </>
            )}
          </div>
        </div>
        <div className="summary-highlight">
          <StarStatsChart completedRows={completedRows} />
          <div className="summary-total-star-count row summary-highlight-block">
            <h1>{calcTotalStars(completedRows)} ⭐</h1>
          </div>
          <div className="summary-total-question-count row summary-highlight-block">
            <h1>{completedRows.length}</h1> <p>{completedRows.length !== 1 ? 'questions' : 'question'}</p>
          </div>
        </div>
        <table className="summary-table">
          <thead>
            <tr>
              {selecting ? (
                <th className="col-select">
                  <input
                    type="checkbox"
                    aria-label="Select all records"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(completedRows.map((row: any) => row.id as number)))}
                  />
                </th>
              ) : null}
              <th className="col-id">ID</th>
              <th className="col-test">Test</th>
              <th className="col-question">Question</th>
              <th className="col-answer">Correct Answer</th>
              <th className="col-proficiency">Proficiency</th>
              <th className="col-next-revision">Next Revision Time</th>
            </tr>
          </thead>
          <tbody>
            {completedRows.map((row: any) => (
              <tr key={row.id} className={selected.has(row.id) ? 'summary-row--selected' : undefined} onClick={selecting ? () => toggle(row.id) : undefined}>
                {selecting ? (
                  <td className="col-select">
                    <input type="checkbox" aria-label={`Select record ${row.id}`} checked={selected.has(row.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggle(row.id)} />
                  </td>
                ) : null}
                <td className="col-id">{row.id}</td>
                <td className="col-test">{row.quiz_title}</td>
                <td className="col-question">{row.question_name}</td>
                <td className="col-answer">{row.correct_answer}</td>
                <td className="col-proficiency">
                  <span className="revision-proficiency-badge">
                    {formatProficiencyDisplay(row.proficiency)}
                  </span>
                </td>
                <td className="col-next-revision">{formatNextRevisionTime(row.next_revision_time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {confirming ? (
        <RemoveRecordsDialog
          records={selectedRows}
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            await onRemoveRecords(selectedRows.map((row: any) => row.id as number));
            setConfirming(false);
            stopSelecting();
          }}
        />
      ) : null}
    </div>
  );
}
