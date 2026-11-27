import { useCallback, useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';
import { buildMigrationReport, fetchMigrationRows, type MigrationReport, type MigrationState } from './services/migrationStatus';

const STATE_LABEL: Record<MigrationState, string> = {
  verified: 'Applied',
  logged: 'Applied (logged only)',
  broken: 'Logged, but objects missing',
  missing: 'Not run',
};

/** Admin page (only shown to users in app_admins): is every Supabase script in this build applied? */
function Admin({ active }: { active: boolean }) {
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const check = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      setReport(buildMigrationReport(__MIGRATION_FILES__, await fetchMigrationRows(supabase)));
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : 'Could not check the database.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (active) void check(); }, [active, check]);

  const missing = report?.entries.filter((entry) => entry.state === 'missing' || entry.state === 'broken') ?? [];

  return (
    <div className="sharing-page">
      <div className="sharing-inner">
        <h2 className="sharing-title">Admin</h2>
        <p className="sharing-muted">Database scripts bundled with this build, checked against Supabase.</p>
        {error ? <p className="sharing-note" role="alert">{error}</p> : null}
        {report ? (
          <>
            {report.allApplied
              ? <p className="sharing-ok">All {report.entries.length} scripts are applied.</p>
              : <p className="sharing-note" role="alert">{missing.length} of {report.entries.length} scripts need attention. Run them in the SQL Editor, oldest first.</p>}
            <ul className="admin-migrations">
              {report.entries.map((entry) => (
                <li key={entry.filename} className="admin-migration">
                  <span className="admin-migration-name">{entry.filename}</span>
                  <span className={entry.state === 'verified' || entry.state === 'logged' ? 'sharing-badge' : 'sharing-badge sharing-badge-warn'}>{STATE_LABEL[entry.state]}</span>
                </li>
              ))}
            </ul>
            {report.unknownToApp.length > 0 ? (
              <p className="sharing-muted">The database has newer scripts than this build knows about: {report.unknownToApp.join(', ')}.</p>
            ) : null}
          </>
        ) : null}
        <div className="admin-actions">
          <button type="button" className="toolbar-btn toolbar-btn--primary" onClick={() => { void check(); }} disabled={loading}>
            {loading ? 'Checking…' : 'Check again'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Admin;
