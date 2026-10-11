import { formatNextRevisionTime, formatProficiencyDisplay } from '../../utils/proficiency';
import { calcTotalStars, countStarLevels } from '../../utils/revisionSession';
import { RevisionDataButtons } from './RevisionDataButtons';

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
}

export function LearntSummary({ completedRows, dueCount, nextRevisionIso, onStartRevision, onDataImported }: LearntSummaryProps) {
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
            <RevisionDataButtons onImported={onDataImported} />
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
              <tr key={row.id}>
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
    </div>
  );
}
