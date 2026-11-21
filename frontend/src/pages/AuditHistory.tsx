import { useCallback, useEffect, useMemo, useState } from 'react';
import { History, RefreshCw, Search } from 'lucide-react';
import { EmptyState, GlassCard, LoadingSkeleton, UnavailableNotice } from '../components/GlassUI';
import { useApp } from '../contexts/AppContext';
import { DEMO_MODE, rawGovernanceApi, type BackendAuditLog } from '../services/api';

export default function AuditHistory() {
  const { user, toast } = useApp();
  const [logs, setLogs] = useState<BackendAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const loadLogs = useCallback(async () => {
    if (DEMO_MODE) return;
    setLoading(true);
    setError('');
    try {
      const data = await rawGovernanceApi.listRawAuditLogs();
      setLogs(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to fetch GET /api/v1/audit.';
      setError(msg);
      toast(msg);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        l.action.toLowerCase().includes(q) ||
        l.resource_type.toLowerCase().includes(q) ||
        (l.resource_id || '').toLowerCase().includes(q),
    );
  }, [logs, search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {error && (
        <UnavailableNotice
          title="Audit History Access"
          reason={error}
          endpointNote={`GET /api/v1/audit requires VIEW_AUDIT (legal_reviewer or brand_admin). Current role: ${user?.role || 'Creator'}`}
        />
      )}

      <GlassCard variant="elevated" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={14} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-muted)' }} />
            <input
              className="liquid-glass-inset"
              style={{ width: '100%', padding: '9px 12px 9px 34px' }}
              placeholder="Search audit action, resource type, or UUID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="button" className="btn" onClick={() => void loadLogs()} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {loading ? (
          <LoadingSkeleton rows={5} height={48} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<History size={28} />}
            title="No audit log entries returned"
            description="Append-only governance events recorded in PostgreSQL (audit_logs) appear here. BrandGuard never fabricates historical audit records."
          />
        ) : (
          <div className="table-scroll">
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Audit ID</th>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Actor</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono" style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                      {row.id.slice(0, 8)}…
                    </td>
                    <td className="font-mono" style={{ fontSize: '0.75rem' }}>
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td>
                      <span className="badge badge-indigo font-mono">{row.action}</span>
                    </td>
                    <td className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--sky)' }}>
                      {row.resource_type} ({(row.resource_id || '').slice(0, 8)}…)
                    </td>
                    <td className="font-mono" style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                      {row.actor_id ? `${row.actor_id.slice(0, 8)}…` : 'system'}
                    </td>
                    <td className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: '260px' }}>
                      {row.details ? JSON.stringify(row.details) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <UnavailableNotice
        title="Cryptographic Hash-Chain Digests"
        reason="Audit entries are persisted append-only in PostgreSQL (audit_logs), but GET /api/v1/audit does not emit SHA-256 cryptographic chain digests."
        endpointNote="Fields returned by GET /api/v1/audit: id, actor_id, action, resource_type, resource_id, details, created_at"
      />
    </div>
  );
}
