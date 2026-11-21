import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  CheckSquare,
  Clock,
  FileText,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  BrandHealthDoughnut,
  ComplianceRadarChart,
  IntegrityLineChart,
  type RadarAxis,
  type SeriesPoint,
} from '../components/SvgCharts';
import {
  EmptyState,
  GlassCard,
  LoadingSkeleton,
  StatusBadge,
  UnavailableNotice,
} from '../components/GlassUI';
import { useApp } from '../contexts/AppContext';
import {
  analyticsApi,
  DEMO_MODE,
  rawGovernanceApi,
  type BackendAnalytics,
  type BackendIssue,
  type BackendSubmission,
} from '../services/api';

const ILLUSTRATIVE_SERIES: Record<'daily' | 'weekly' | 'monthly', SeriesPoint[]> = {
  daily: [
    { label: 'Mon', value: 84 },
    { label: 'Tue', value: 87 },
    { label: 'Wed', value: 86 },
    { label: 'Thu', value: 91 },
    { label: 'Fri', value: 93 },
    { label: 'Sat', value: 92 },
    { label: 'Sun', value: 94 },
  ],
  weekly: [
    { label: 'W1', value: 79 },
    { label: 'W2', value: 83 },
    { label: 'W3', value: 86 },
    { label: 'W4', value: 90 },
    { label: 'W5', value: 92 },
    { label: 'W6', value: 94 },
  ],
  monthly: [
    { label: 'Jun', value: 76 },
    { label: 'Jul', value: 81 },
    { label: 'Aug', value: 84 },
    { label: 'Sep', value: 88 },
    { label: 'Oct', value: 91 },
    { label: 'Nov', value: 94 },
  ],
};

const ILLUSTRATIVE_RADAR: RadarAxis[] = [
  { axis: 'Tone', score: 88 },
  { axis: 'Terminology', score: 94 },
  { axis: 'Claims', score: 78 },
  { axis: 'Privacy', score: 91 },
  { axis: 'Consistency', score: 85 },
  { axis: 'Visual', score: 82 },
];

export default function CommandCentre() {
  const { user } = useApp();
  const navigate = useNavigate();
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submissions, setSubmissions] = useState<BackendSubmission[]>([]);
  const [issues, setIssues] = useState<BackendIssue[]>([]);
  const [analytics, setAnalytics] = useState<BackendAnalytics | null>(null);

  const isAnalyticsRole =
    user?.role === 'Reviewer' || user?.role === 'Brand Admin' || user?.role === 'Tenant Admin';

  const loadData = useCallback(async () => {
    if (DEMO_MODE) return;
    setLoading(true);
    setError('');
    try {
      const [subList, issueList] = await Promise.all([
        rawGovernanceApi.listSubmissions(50, 0),
        rawGovernanceApi.listIssues(),
      ]);
      setSubmissions(subList);
      setIssues(issueList);

      if (isAnalyticsRole) {
        const dash = await analyticsApi.dashboard();
        setAnalytics(dash);
      } else {
        setAnalytics(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach BrandGuard analytics endpoints.');
    } finally {
      setLoading(false);
    }
  }, [isAnalyticsRole]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totalAudited = submissions.length;
  const resolvedCount = issues.filter((i) => i.status === 'fixed').length;
  const openViolations = issues.filter((i) => i.status === 'open').length;
  const openCritical = issues.filter(
    (i) => i.status === 'open' && ['critical', 'high'].includes(i.severity.toLowerCase()),
  ).length;
  const openWarnings = issues.filter(
    (i) => i.status === 'open' && i.severity.toLowerCase() === 'medium',
  ).length;
  const openLow = issues.filter(
    (i) => i.status === 'open' && i.severity.toLowerCase() === 'low',
  ).length;
  const pendingApprovals = submissions.filter((s) => !s.is_locked && s.status !== 'rejected').length;
  const resolvedRate = issues.length ? Math.round((resolvedCount / issues.length) * 100) : null;
  const integrityScore =
    issues.length > 0
      ? Math.max(0, Math.round(100 - (openCritical * 12 + openWarnings * 5 + openLow * 2)))
      : totalAudited > 0
        ? 100
        : null;

  const doughnutSegments = [
    { label: 'Resolved', value: resolvedCount, color: '#10b981' },
    { label: 'Critical / High', value: openCritical, color: '#f43f5e' },
    { label: 'Warnings', value: openWarnings, color: '#f59e0b' },
    { label: 'Info', value: openLow, color: '#38bdf8' },
  ];

  const radarAxes: RadarAxis[] =
    issues.length > 0
      ? ['tone', 'terminology', 'claim', 'context', 'consistency', 'visual'].map((cat) => {
          const openCat = issues.filter((i) => i.category.toLowerCase() === cat && i.status === 'open').length;
          return {
            axis: cat.charAt(0).toUpperCase() + cat.slice(1),
            score: Math.max(30, 100 - openCat * 15),
          };
        })
      : DEMO_MODE
        ? ILLUSTRATIVE_RADAR
        : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Executive Welcome & Quick Actions Header */}
      <GlassCard variant="elevated" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div className="eyebrow">{user?.tenantName || 'ENTERPRISE WORKSPACE'} · {user?.role || 'Creator'}</div>
          <h1 className="font-editorial" style={{ margin: '4px 0 4px', fontSize: '2rem', lineHeight: 1.1 }}>
            Protect every brand expression before it reaches the world.
          </h1>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
            {openCritical > 0
              ? `${openCritical} critical/high violation(s) and ${pendingApprovals} pending submission(s) require attention.`
              : pendingApprovals > 0
                ? `${pendingApprovals} submission(s) awaiting human curator review.`
                : 'No open critical blockers detected across active tenant submissions.'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/review-studio')}>
            <FileText size={14} /> New Content Audit
          </button>
          <button type="button" className="btn" onClick={() => navigate('/approvals')}>
            <CheckSquare size={14} /> Approval Queue
          </button>
          <button type="button" className="btn" onClick={() => navigate('/ai-studio')}>
            <Sparkles size={14} /> AI Studio
          </button>
          <button type="button" className="btn" onClick={() => navigate('/archive')}>
            <BookOpen size={14} /> Brand Archive
          </button>
        </div>
      </GlassCard>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['daily', 'weekly', 'monthly'] as const).map((tf) => (
            <button
              key={tf}
              type="button"
              className={`btn ${timeframe === tf ? 'btn-primary' : ''}`}
              style={{ padding: '6px 12px', textTransform: 'capitalize' }}
              onClick={() => setTimeframe(tf)}
            >
              {tf}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => void loadData()} disabled={loading}>
          <RefreshCw size={14} /> {loading ? 'Refreshing...' : 'Refresh Telemetry'}
        </button>
      </div>

      {error && (
        <GlassCard variant="subtle" style={{ borderColor: 'rgba(244,63,94,0.45)', padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fda4af', fontSize: '0.84rem' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
            <button type="button" className="btn btn-coral" onClick={() => void loadData()}>
              Retry
            </button>
          </div>
        </GlassCard>
      )}

      {loading ? (
        <LoadingSkeleton rows={4} height={80} />
      ) : (
        <>
          <div className="grid-kpi">
            <GlassCard>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Brand Integrity Score</div>
              <div className="font-mono" style={{ fontSize: '2rem', fontWeight: 700, marginTop: '6px', color: 'var(--emerald)' }}>
                {integrityScore !== null ? `${integrityScore}%` : '—'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {totalAudited} audited submission(s)
              </div>
            </GlassCard>

            <GlassCard>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Active Violations</div>
              <div className="font-mono" style={{ fontSize: '2rem', fontWeight: 700, marginTop: '6px', color: openCritical > 0 ? 'var(--coral)' : 'var(--text-primary)' }}>
                {openViolations}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {openCritical} critical/high blockers
              </div>
            </GlassCard>

            <GlassCard>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Resolved Issue Rate</div>
              <div className="font-mono" style={{ fontSize: '2rem', fontWeight: 700, marginTop: '6px', color: 'var(--accent-blue)' }}>
                {resolvedRate !== null ? `${resolvedRate}%` : '—'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {resolvedCount} of {issues.length} findings fixed
              </div>
            </GlassCard>

            <GlassCard>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Approval Queue</div>
              <div className="font-mono" style={{ fontSize: '2rem', fontWeight: 700, marginTop: '6px', color: 'var(--amber)' }}>
                {pendingApprovals}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {analytics ? `${analytics.total_approvals} curator decisions recorded` : 'Awaiting human curator'}
              </div>
            </GlassCard>
          </div>

          <div className="grid-2">
            <GlassCard>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 className="font-editorial" style={{ margin: 0, fontSize: '1.45rem' }}>
                  Brand Integrity Over Time
                </h3>
                {DEMO_MODE ? (
                  <span className="badge badge-amber">Illustrative Demo Data ({timeframe})</span>
                ) : (
                  <span className="badge badge-sky">Live Snapshot Mode</span>
                )}
              </div>
              {DEMO_MODE ? (
                <IntegrityLineChart data={ILLUSTRATIVE_SERIES[timeframe]} />
              ) : (
                <UnavailableNotice
                  title="Historical Time-Series Endpoint"
                  reason="GET /api/v1/analytics/dashboard returns aggregate snapshot metrics rather than daily/weekly/monthly historical series. BrandGuard never invents historical trends."
                  endpointNote="Snapshot fields: most_violated_guidelines, violations_by_channel, dispute_rate, override_rate, stale_claims_count, total_approvals"
                />
              )}
            </GlassCard>

            <GlassCard>
              <h3 className="font-editorial" style={{ margin: '0 0 12px', fontSize: '1.45rem' }}>
                Compliance Distribution
              </h3>
              {issues.length > 0 ? (
                <BrandHealthDoughnut segments={doughnutSegments} />
              ) : (
                <EmptyState
                  icon={<CheckCircle2 size={28} />}
                  title="No diagnostic issues recorded yet"
                  description="Run an audit in Review Studio to populate live severity distribution."
                  action={
                    <button type="button" className="btn btn-primary" onClick={() => navigate('/review-studio')}>
                      Launch Review Studio
                    </button>
                  }
                />
              )}
            </GlassCard>
          </div>

          <div className="grid-2">
            <GlassCard>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 className="font-editorial" style={{ margin: 0, fontSize: '1.45rem' }}>
                  Six-Dimensional Brand Health Radar
                </h3>
                {issues.length === 0 && DEMO_MODE && <span className="badge badge-amber">Illustrative Demo Data</span>}
              </div>
              {radarAxes.length > 0 ? (
                <ComplianceRadarChart axes={radarAxes} />
              ) : (
                <EmptyState
                  icon={<BarChart3 size={28} />}
                  title="Awaiting multi-category diagnostics"
                  description="Audit content across channels to compute Tone, Terminology, Claims, Context, Consistency, and Visual scores."
                />
              )}
            </GlassCard>

            <GlassCard>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 className="font-editorial" style={{ margin: 0, fontSize: '1.45rem' }}>
                  Frequently Violated Guidelines
                </h3>
                <button type="button" className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => navigate('/insights')}>
                  Full Insights <ArrowUpRight size={13} />
                </button>
              </div>
              {!isAnalyticsRole && !DEMO_MODE ? (
                <UnavailableNotice
                  title="Organization Analytics Restricted"
                  reason="GET /api/v1/analytics/dashboard requires VIEW_ANALYTICS (brand_manager, legal_reviewer, or brand_admin)."
                  endpointNote={`Current role: ${user?.role || 'Creator'}`}
                />
              ) : analytics?.most_violated_guidelines?.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {analytics.most_violated_guidelines.map((row) => (
                    <div
                      key={row.rule_ref}
                      className="liquid-glass-subtle"
                      style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <span className="font-mono" style={{ fontSize: '0.82rem', color: 'var(--sky)' }}>
                        {row.rule_ref}
                      </span>
                      <span className="badge badge-coral">{row.count} violations</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<Clock size={26} />}
                  title="No guideline violations aggregated"
                  description="Detected guideline violations will aggregate here automatically."
                />
              )}
            </GlassCard>
          </div>

          <GlassCard>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 className="font-editorial" style={{ margin: 0, fontSize: '1.45rem' }}>
                Recent Governance Activity
              </h3>
              <button type="button" className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => navigate('/review-studio')}>
                Open Studio <ArrowUpRight size={13} />
              </button>
            </div>
            {submissions.length === 0 ? (
              <EmptyState
                icon={<Clock size={26} />}
                title="No submissions yet"
                description="Create your first audited submission in Review Studio."
              />
            ) : (
              <div className="table-scroll">
                <table className="glass-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Channel</th>
                      <th>Sensitivity</th>
                      <th>Version</th>
                      <th>Status</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.slice(0, 8).map((sub) => (
                      <tr key={sub.id}>
                        <td style={{ fontWeight: 600 }}>{sub.title}</td>
                        <td style={{ textTransform: 'capitalize' }}>{sub.channel}</td>
                        <td>
                          <span className="badge badge-indigo">{sub.sensitivity_label}</span>
                        </td>
                        <td className="font-mono">v{sub.current_version_number}</td>
                        <td>
                          <StatusBadge status={sub.status} />
                        </td>
                        <td className="font-mono" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          {new Date(sub.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </>
      )}
    </div>
  );
}
