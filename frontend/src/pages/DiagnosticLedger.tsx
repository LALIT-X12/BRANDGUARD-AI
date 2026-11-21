import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpDown, Eye, ListChecks, RefreshCw, Search, Sparkles, X } from 'lucide-react';
import { EmptyState, GlassCard, LoadingSkeleton, SeverityBadge, StatusBadge } from '../components/GlassUI';
import { useApp } from '../contexts/AppContext';
import {
  DEMO_MODE,
  fixesApi,
  rawGovernanceApi,
  type BackendFix,
  type BackendIssue,
  type BackendSubmission,
} from '../services/api';

const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export default function DiagnosticLedger() {
  const { toast } = useApp();
  const [searchParams] = useSearchParams();

  const [issues, setIssues] = useState<BackendIssue[]>([]);
  const [subMap, setSubMap] = useState<Record<string, BackendSubmission>>({});
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'severity' | 'confidence' | 'category'>('severity');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [inspected, setInspected] = useState<BackendIssue | null>(null);
  const [inspectedFix, setInspectedFix] = useState<BackendFix | null>(null);
  const [fixingId, setFixingId] = useState<string | null>(null);

  const loadIssues = useCallback(async () => {
    if (DEMO_MODE) return;
    setLoading(true);
    try {
      const [issueList, subList] = await Promise.all([
        rawGovernanceApi.listIssues(),
        rawGovernanceApi.listSubmissions(100, 0),
      ]);
      setIssues(issueList);
      setSubMap(Object.fromEntries(subList.map((s) => [s.id, s])));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to fetch GET /api/v1/issues.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadIssues();
  }, [loadIssues]);

  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = issues.filter((item) => {
      if (categoryFilter !== 'all' && item.category.toLowerCase() !== categoryFilter) return false;
      if (severityFilter !== 'all' && item.severity.toLowerCase() !== severityFilter) return false;
      if (statusFilter !== 'all' && item.status.toLowerCase() !== statusFilter) return false;
      if (!q) return true;
      const subTitle = subMap[item.submission_id]?.title || '';
      return (
        item.evidence.toLowerCase().includes(q) ||
        item.rule_ref.toLowerCase().includes(q) ||
        (item.source_ref || '').toLowerCase().includes(q) ||
        subTitle.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'severity') {
        return (SEV_RANK[b.severity.toLowerCase()] || 0) - (SEV_RANK[a.severity.toLowerCase()] || 0);
      }
      if (sortBy === 'confidence') {
        return b.confidence - a.confidence;
      }
      return a.category.localeCompare(b.category);
    });
  }, [issues, subMap, search, categoryFilter, severityFilter, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / pageSize));
  const pagedRows = filteredAndSorted.slice((page - 1) * pageSize, page * pageSize);

  const handleRequestFix = async (issue: BackendIssue) => {
    setFixingId(issue.id);
    try {
      const fix = await fixesApi.request(issue.id);
      setInspected(issue);
      setInspectedFix(fix);
      toast(`Fix generated (${fix.validation_status}).`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Fix generation failed.');
    } finally {
      setFixingId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <GlassCard variant="elevated" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={14} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-muted)' }} />
            <input
              className="liquid-glass-inset"
              style={{ width: '100%', padding: '8px 12px 8px 34px' }}
              placeholder="Search passage, submission, rule code..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <select
            className="liquid-glass-inset"
            style={{ padding: '8px 10px' }}
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter category"
          >
            <option value="all">All Categories</option>
            <option value="tone">Tone</option>
            <option value="terminology">Terminology</option>
            <option value="claim">Claim</option>
            <option value="visual">Visual</option>
          </select>

          <select
            className="liquid-glass-inset"
            style={{ padding: '8px 10px' }}
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter severity"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Warning / Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            className="liquid-glass-inset"
            style={{ padding: '8px 10px' }}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter status"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="fixed">Fixed</option>
            <option value="disputed">Disputed</option>
          </select>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <ArrowUpDown size={13} color="var(--text-muted)" />
            <select
              className="liquid-glass-inset"
              style={{ padding: '8px 10px' }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'severity' | 'confidence' | 'category')}
              aria-label="Sort issues"
            >
              <option value="severity">Sort: Severity</option>
              <option value="confidence">Sort: Confidence</option>
              <option value="category">Sort: Category</option>
            </select>
          </div>

          <button type="button" className="btn" onClick={() => void loadIssues()} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {loading ? (
          <LoadingSkeleton rows={5} height={54} />
        ) : pagedRows.length === 0 ? (
          <EmptyState
            icon={<ListChecks size={28} />}
            title="No matching compliance issues"
            description="Adjust filters or submit a manuscript in Review Studio to populate GET /api/v1/issues."
          />
        ) : (
          <>
            <div className="table-scroll">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Severity</th>
                    <th>Category</th>
                    <th>Affected Submission</th>
                    <th>Flagged Passage</th>
                    <th>Rule Ref</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((item) => (
                    <tr key={item.id}>
                      <td className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {item.id.slice(0, 8)}
                      </td>
                      <td>
                        <SeverityBadge severity={item.severity} />
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>{item.category}</td>
                      <td style={{ fontWeight: 600, maxWidth: '170px' }}>
                        {subMap[item.submission_id]?.title || `${item.submission_id.slice(0, 8)}…`}
                      </td>
                      <td className="font-manuscript" style={{ maxWidth: '240px' }}>
                        “{item.evidence}”
                      </td>
                      <td className="font-mono" style={{ color: 'var(--sky)', fontSize: '0.75rem' }}>
                        {item.rule_ref}
                      </td>
                      <td>
                        <StatusBadge status={item.status} />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn"
                            style={{ padding: '5px 8px', fontSize: '0.73rem' }}
                            onClick={() => {
                              setInspected(item);
                              setInspectedFix(null);
                            }}
                          >
                            <Eye size={13} /> Inspect
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '5px 8px', fontSize: '0.73rem' }}
                            onClick={() => void handleRequestFix(item)}
                            disabled={fixingId === item.id || item.status === 'fixed'}
                          >
                            <Sparkles size={13} /> Fix
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              <span>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredAndSorted.length)} of{' '}
                {filteredAndSorted.length} issue(s)
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" className="btn" style={{ padding: '5px 10px' }} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </button>
                <span className="font-mono" style={{ padding: '6px 8px' }}>
                  {page} / {totalPages}
                </span>
                <button type="button" className="btn" style={{ padding: '5px 10px' }} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </GlassCard>

      {/* Slide-Over Issue Inspection Drawer */}
      {inspected && (
        <div className="drawer-backdrop" role="dialog" aria-modal="true" onClick={() => setInspected(null)}>
          <div className="drawer-panel liquid-glass-floating" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="eyebrow">DIAGNOSTIC INSPECTION</div>
              <button type="button" className="btn btn-ghost" style={{ padding: '5px' }} onClick={() => setInspected(null)} aria-label="Close drawer">
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <SeverityBadge severity={inspected.severity} />
              <StatusBadge status={inspected.status} />
              <span className="badge badge-indigo font-mono">{inspected.checker_type}</span>
            </div>

            <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--sky)' }}>
              Rule Reference: {inspected.rule_ref}
            </div>

            <div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Confidence Score ({Math.round(inspected.confidence * 100)}%)
              </div>
              <div style={{ height: '6px', borderRadius: '999px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(inspected.confidence * 100)}%`, background: 'var(--accent-blue)' }} />
              </div>
            </div>

            <div className="liquid-glass-inset font-manuscript" style={{ padding: '12px', borderLeft: '3px solid var(--coral)' }}>
              “{inspected.evidence}”
            </div>

            {inspected.source_ref && (
              <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                <strong style={{ color: 'var(--text-primary)' }}>Rationale / Source:</strong> {inspected.source_ref}
              </div>
            )}

            {inspected.suggested_fix && (
              <div className="liquid-glass-subtle" style={{ padding: '12px', fontSize: '0.83rem', color: '#a7f3d0' }}>
                <strong>Initial Hint:</strong> {inspected.suggested_fix}
              </div>
            )}

            {inspectedFix && (
              <div className="liquid-glass-inset" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--accent-violet)' }}>VALIDATED FIX PROPOSAL</span>
                  <StatusBadge status={inspectedFix.validation_status} />
                </div>
                <div className="font-manuscript" style={{ fontSize: '0.9rem' }}>
                  {inspectedFix.proposed_content}
                </div>
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleRequestFix(inspected)}
              disabled={fixingId === inspected.id || inspected.status === 'fixed'}
            >
              <Sparkles size={14} /> {fixingId === inspected.id ? 'Generating & Validating...' : 'Generate & Validate Fix'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
