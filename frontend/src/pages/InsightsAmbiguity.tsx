import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { ChannelHeatmap } from '../components/SvgCharts';
import { EmptyState, GlassCard, LoadingSkeleton, UnavailableNotice } from '../components/GlassUI';
import { useApp } from '../contexts/AppContext';
import {
  analyticsApi,
  DEMO_MODE,
  rawGovernanceApi,
  type BackendAnalytics,
  type BackendIssue,
} from '../services/api';

const ILLUSTRATIVE_INSIGHTS: BackendAnalytics = {
  most_violated_guidelines: [
    { rule_ref: 'COMP-002', count: 14 },
    { rule_ref: 'TONE-001', count: 11 },
    { rule_ref: 'PRIV-003', count: 7 },
  ],
  violations_by_channel: [
    { channel: 'landing', count: 15 },
    { channel: 'social', count: 12 },
    { channel: 'blog', count: 6 },
    { channel: 'press', count: 4 },
  ],
  dispute_rate: 0.14,
  override_rate: 0.22,
  stale_claims_count: 2,
  total_approvals: 29,
};

export default function InsightsAmbiguity() {
  const { user } = useApp();
  const [data, setData] = useState<BackendAnalytics | null>(null);
  const [issues, setIssues] = useState<BackendIssue[]>([]);
  const [coverage, setCoverage] = useState({ guidelines: 0, claims: 0, stale: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isAnalyticsRole =
    user?.role === 'Reviewer' || user?.role === 'Brand Admin' || user?.role === 'Tenant Admin';

  const load = useCallback(async () => {
    if (DEMO_MODE) return;
    setLoading(true);
    setError('');
    try {
      const [issueList, gList, cList, staleList] = await Promise.all([
        rawGovernanceApi.listIssues(),
        rawGovernanceApi.listRawGuidelines(),
        rawGovernanceApi.listRawClaims(),
        rawGovernanceApi.listStaleClaims(),
      ]);
      setIssues(issueList);
      setCoverage({ guidelines: gList.length, claims: cList.length, stale: staleList.length });

      if (isAnalyticsRole) {
        const dash = await analyticsApi.dashboard();
        setData(dash);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load governance insights.');
    } finally {
      setLoading(false);
    }
  }, [isAnalyticsRole]);

  useEffect(() => {
    void load();
  }, [load]);

  const effective = data || (DEMO_MODE ? ILLUSTRATIVE_INSIGHTS : null);

  const categoryBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of issues) {
      const k = i.category.toLowerCase();
      counts[k] = (counts[k] || 0) + 1;
    }
    const max = Math.max(1, ...Object.values(counts));
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, count, pct: Math.round((count / max) * 100) }));
  }, [issues]);

  const riskBreakdown = useMemo(() => {
    const levels = ['critical', 'high', 'medium', 'low'] as const;
    const total = Math.max(1, issues.length);
    return levels.map((lvl) => {
      const count = issues.filter((i) => i.severity.toLowerCase() === lvl).length;
      return { level: lvl, count, pct: Math.round((count / total) * 100) };
    });
  }, [issues]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div className="font-mono" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
          Knowledge Coverage: {coverage.guidelines} guideline(s) · {coverage.claims} claim(s) · {coverage.stale} stale
        </div>
        <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} /> Refresh Insights
        </button>
      </div>

      {!isAnalyticsRole && !DEMO_MODE && (
        <UnavailableNotice
          title="Organization Dispute & Channel Aggregates Restricted"
          reason="GET /api/v1/analytics/dashboard enforces VIEW_ANALYTICS (brand_manager, legal_reviewer, or brand_admin). Live issue category & risk distributions below are still computed from your accessible issues."
          endpointNote={`Active role: ${user?.role || 'Creator'}`}
        />
      )}

      {error && (
        <GlassCard variant="subtle" style={{ borderColor: 'rgba(244,63,94,0.45)' }}>
          <span style={{ color: '#fda4af', fontSize: '0.84rem' }}>{error}</span>
        </GlassCard>
      )}

      {loading ? (
        <LoadingSkeleton rows={4} height={80} />
      ) : (
        <>
          <div className="grid-2">
            <GlassCard variant="elevated">
              <h3 className="font-editorial" style={{ margin: '0 0 12px', fontSize: '1.45rem' }}>
                Issue Category Distribution (Live)
              </h3>
              {categoryBreakdown.length === 0 ? (
                <EmptyState
                  icon={<Activity size={24} />}
                  title="No issues categorized yet"
                  description="Run content audits to populate live category distributions."
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {categoryBreakdown.map((row) => (
                    <div key={row.category}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                        <span style={{ textTransform: 'capitalize' }}>{row.category}</span>
                        <span className="font-mono" style={{ color: 'var(--sky)' }}>{row.count}</span>
                      </div>
                      <div style={{ height: '7px', borderRadius: '999px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                        <div style={{ width: `${row.pct}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent-blue), var(--accent-violet))' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>

            <GlassCard variant="elevated">
              <h3 className="font-editorial" style={{ margin: '0 0 12px', fontSize: '1.45rem' }}>
                Risk & Severity Distribution (Live)
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {riskBreakdown.map((row) => {
                  const color =
                    row.level === 'critical' || row.level === 'high'
                      ? 'var(--coral)'
                      : row.level === 'medium'
                        ? 'var(--amber)'
                        : 'var(--sky)';
                  return (
                    <div key={row.level}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                        <span style={{ textTransform: 'capitalize' }}>{row.level}</span>
                        <span className="font-mono" style={{ color }}>
                          {row.count} ({row.pct}%)
                        </span>
                      </div>
                      <div style={{ height: '7px', borderRadius: '999px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                        <div style={{ width: `${row.pct}%`, height: '100%', background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          </div>

          {effective && (
            <>
              <div className="grid-3">
                <GlassCard>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Dispute Rate</div>
                  <div className="font-mono" style={{ fontSize: '1.9rem', fontWeight: 700, color: 'var(--amber)', marginTop: '6px' }}>
                    {Math.round(effective.dispute_rate * 100)}%
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Creator-challenged findings</div>
                </GlassCard>
                <GlassCard>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Override Rate (Ambiguity)</div>
                  <div className="font-mono" style={{ fontSize: '1.9rem', fontWeight: 700, color: 'var(--coral)', marginTop: '6px' }}>
                    {Math.round(effective.override_rate * 100)}%
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Reviewer-overturned disputes</div>
                </GlassCard>
                <GlassCard>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Stale Claims Risk</div>
                  <div className="font-mono" style={{ fontSize: '1.9rem', fontWeight: 700, color: 'var(--accent-violet)', marginTop: '6px' }}>
                    {effective.stale_claims_count}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Expired claims needing renewal</div>
                </GlassCard>
              </div>

              <GlassCard>
                <h3 className="font-editorial" style={{ margin: '0 0 12px', fontSize: '1.45rem' }}>
                  Channel Discrepancy Heatmap
                </h3>
                {effective.violations_by_channel.length ? (
                  <ChannelHeatmap rows={effective.violations_by_channel} />
                ) : (
                  <EmptyState
                    icon={<Activity size={24} />}
                    title="No channel discrepancies aggregated"
                    description="Violations grouped by publishing channel appear here once audits complete."
                  />
                )}
              </GlassCard>
            </>
          )}

          <UnavailableNotice
            title="Automated Policy Improvement & Per-Rule Calibration"
            reason="GET /api/v1/analytics/dashboard provides measured dispute/override rates and violation counts, but the backend does not yet provide automated policy rewrite suggestions or per-rule precision/recall calibration."
            endpointNote="Missing backend capability: GET /api/v1/analytics/ambiguity-recommendations"
          />
        </>
      )}
    </div>
  );
}
