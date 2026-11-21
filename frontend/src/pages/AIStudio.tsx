import { useRef, useState, type FormEvent } from 'react';
import {
  Activity,
  BookOpen,
  CheckCircle2,
  FileUp,
  HelpCircle,
  Play,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react';
import {
  GlassCard,
  LoadingSkeleton,
  SeverityBadge,
  StatusBadge,
  UnavailableNotice,
} from '../components/GlassUI';
import { useApp } from '../contexts/AppContext';
import { useStudio } from '../contexts/StudioContext';
import {
  analyticsApi,
  fixesApi,
  rawGovernanceApi,
  reviewsApi,
  type BackendAnalytics,
  type BackendClaim,
  type BackendFix,
  type BackendIssue,
} from '../services/api';

const MODULES = [
  { id: 'auditor', label: '1. AI Brand Auditor', icon: Play, available: true },
  { id: 'fixer', label: '2. AI Correction Assistant', icon: Wand2, available: true },
  { id: 'explainer', label: '3. AI Brand Explainer', icon: HelpCircle, available: false },
  { id: 'claims', label: '4. AI Claim Verifier', icon: ShieldCheck, available: true },
  { id: 'assistant', label: '5. AI Guideline Assistant', icon: BookOpen, available: false },
  { id: 'patterns', label: '6. AI Pattern Detector', icon: Activity, available: true },
] as const;

const SAMPLES = {
  auditor:
    'Act now for the #1 enterprise platform in the world! 100% guaranteed instant results with zero risk — last chance to sign up today!!!',
  claims:
    'Our platform is clinically proven to cure workflow bottlenecks with 100% guaranteed uptime and no side effects.',
};

export default function AIStudio() {
  const { user, toast } = useApp();
  const { studio, pushAIHistory } = useStudio();
  const fileRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<(typeof MODULES)[number]['id']>('auditor');

  // 1. Auditor
  const [auditText, setAuditText] = useState('');
  const [auditFormat, setAuditFormat] = useState<'social' | 'blog' | 'press' | 'landing'>('landing');
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditFindings, setAuditFindings] = useState<BackendIssue[]>([]);

  // 2. Fix Assistant
  const [issueIdInput, setIssueIdInput] = useState('');
  const [fixBusy, setFixBusy] = useState(false);
  const [fixResult, setFixResult] = useState<BackendFix | null>(null);

  // 4. Claim Verifier
  const [claimText, setClaimText] = useState('');
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimFindings, setClaimFindings] = useState<BackendIssue[]>([]);
  const [registryClaims, setRegistryClaims] = useState<BackendClaim[]>([]);

  // 6. Pattern Detector
  const [patternBusy, setPatternBusy] = useState(false);
  const [patternData, setPatternData] = useState<BackendAnalytics | null>(null);

  const isAnalyticsRole =
    user?.role === 'Reviewer' || user?.role === 'Brand Admin' || user?.role === 'Tenant Admin';

  const handleUploadTextFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['txt', 'md', 'json'].includes(ext)) {
      toast('AI Studio file loader accepts TXT, MD, or JSON files.');
      return;
    }
    const raw = await file.text();
    let extracted = raw;
    if (ext === 'json') {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (typeof parsed.text === 'string') extracted = parsed.text;
        else if (typeof parsed.content === 'string') extracted = parsed.content;
      } catch {
        // Keep raw JSON text
      }
    }
    if (activeTab === 'claims') setClaimText(extracted);
    else setAuditText(extracted);
    toast(`Loaded ${file.name} into AI Studio input.`);
  };

  const runBrandAudit = async (e: FormEvent) => {
    e.preventDefault();
    if (!auditText.trim()) return;
    setAuditBusy(true);
    try {
      const sub = await rawGovernanceApi.submitText({
        title: `AI Studio Audit (${new Date().toLocaleTimeString()})`,
        channel: auditFormat,
        audience: 'enterprise',
        intent: 'AI Studio pre-publication audit',
        content_format: 'text',
        sensitivity_label: 'internal',
        raw_text: auditText,
      });
      const session = await reviewsApi.start(sub.id);
      const found = await rawGovernanceApi.listIssues({ submissionId: sub.id, reviewSessionId: session.id });
      setAuditFindings(found);
      pushAIHistory({
        module: 'AI Brand Auditor',
        summary: `${found.length} finding(s) · risk=${session.risk_level || 'low'}`,
        status: found.length ? 'warning' : 'ok',
      });
      toast(`Backend AI audit completed: ${found.length} discrepancy(ies).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI audit failed.';
      pushAIHistory({ module: 'AI Brand Auditor', summary: msg, status: 'error' });
      toast(msg);
    } finally {
      setAuditBusy(false);
    }
  };

  const runFixAssistant = async (e: FormEvent) => {
    e.preventDefault();
    if (!issueIdInput.trim()) return;
    setFixBusy(true);
    try {
      const res = await fixesApi.request(issueIdInput.trim());
      setFixResult(res);
      pushAIHistory({
        module: 'AI Correction Assistant',
        summary: `Issue ${issueIdInput.slice(0, 8)}… -> ${res.validation_status}`,
        status: res.validation_status === 'validated' ? 'ok' : 'warning',
      });
      toast(`Correction returned (${res.validation_status}).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Correction generation failed.';
      pushAIHistory({ module: 'AI Correction Assistant', summary: msg, status: 'error' });
      toast(msg);
    } finally {
      setFixBusy(false);
    }
  };

  const adoptFix = async () => {
    if (!fixResult) return;
    try {
      const updated = await fixesApi.decide(fixResult.id, 'accepted');
      setFixResult(updated);
      toast('Correction adopted via POST /api/v1/fixes/{fix_id}/decision.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not adopt correction.');
    }
  };

  const runClaimVerifier = async (e: FormEvent) => {
    e.preventDefault();
    if (!claimText.trim()) return;
    setClaimBusy(true);
    try {
      const [regClaims, sub] = await Promise.all([
        rawGovernanceApi.listRawClaims(),
        rawGovernanceApi.submitText({
          title: `Claim Verification (${new Date().toLocaleTimeString()})`,
          channel: 'web',
          audience: 'enterprise',
          intent: 'verify factual and quantitative claims',
          content_format: 'text',
          sensitivity_label: 'regulated',
          raw_text: claimText,
        }),
      ]);
      setRegistryClaims(regClaims);
      const session = await reviewsApi.start(sub.id);
      const found = await rawGovernanceApi.listIssues({ submissionId: sub.id, reviewSessionId: session.id });
      const claimOnly = found.filter((f) => f.category === 'claim' || f.checker_type === 'ai_assisted');
      setClaimFindings(claimOnly);
      pushAIHistory({
        module: 'AI Claim Verifier',
        summary: `${claimOnly.length} claim diagnostic(s) against ${regClaims.length} registry entries`,
        status: claimOnly.length ? 'warning' : 'ok',
      });
      toast('Claim verification finished through FastAPI orchestration.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Claim verification failed.';
      pushAIHistory({ module: 'AI Claim Verifier', summary: msg, status: 'error' });
      toast(msg);
    } finally {
      setClaimBusy(false);
    }
  };

  const loadPatterns = async () => {
    setPatternBusy(true);
    try {
      const dash = await analyticsApi.dashboard();
      setPatternData(dash);
      pushAIHistory({
        module: 'AI Pattern Detector',
        summary: `Loaded ${dash.most_violated_guidelines.length} top violated rule aggregates`,
        status: 'ok',
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load violation aggregates.');
    } finally {
      setPatternBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <GlassCard style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {MODULES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              className={`btn ${activeTab === m.id ? 'btn-primary' : ''}`}
              onClick={() => setActiveTab(m.id)}
            >
              <Icon size={14} />
              <span>{m.label}</span>
              {!m.available && <span className="badge badge-amber">Unavailable</span>}
            </button>
          );
        })}
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUploadTextFile(f);
            e.target.value = '';
          }}
        />
      </GlassCard>

      <div className="studio-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {activeTab === 'auditor' && (
            <GlassCard variant="elevated" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={18} color="var(--indigo)" />
                  <h3 className="font-editorial" style={{ margin: 0, fontSize: '1.5rem' }}>
                    AI Brand Auditor
                  </h3>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="btn" onClick={() => setAuditText(SAMPLES.auditor)}>
                    Load Sample
                  </button>
                  <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                    <FileUp size={14} /> TXT / MD / JSON
                  </button>
                </div>
              </div>

              <form onSubmit={runBrandAudit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Format:</span>
                  {(['social', 'blog', 'press', 'landing'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      className={`btn ${auditFormat === fmt ? 'btn-primary' : ''}`}
                      style={{ padding: '5px 10px', fontSize: '0.75rem', textTransform: 'capitalize' }}
                      onClick={() => setAuditFormat(fmt)}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
                <textarea
                  className="liquid-glass-inset font-manuscript"
                  rows={6}
                  style={{ padding: '12px' }}
                  value={auditText}
                  onChange={(e) => setAuditText(e.target.value)}
                  placeholder="Paste copy to submit via POST /api/v1/submissions/text -> POST /api/v1/reviews..."
                  required
                />
                <button type="submit" className="btn btn-primary" disabled={auditBusy} style={{ alignSelf: 'flex-start' }}>
                  <Play size={14} /> {auditBusy ? 'Auditing via FastAPI...' : 'Run Backend Brand Audit'}
                </button>
              </form>

              {auditBusy && <LoadingSkeleton rows={2} height={64} />}
              {auditFindings.map((f) => (
                <div key={f.id} className="liquid-glass-subtle" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                    <SeverityBadge severity={f.severity} />
                    <span className="font-mono" style={{ fontSize: '0.73rem', color: 'var(--sky)' }}>
                      {f.rule_ref} · ID: {f.id}
                    </span>
                  </div>
                  <div className="font-manuscript">“{f.evidence}”</div>
                  {f.suggested_fix && <div style={{ fontSize: '0.8rem', color: '#a7f3d0' }}>Suggested: {f.suggested_fix}</div>}
                  <button
                    type="button"
                    className="btn"
                    style={{ alignSelf: 'flex-start', padding: '5px 9px', fontSize: '0.74rem' }}
                    onClick={() => {
                      setIssueIdInput(f.id);
                      setActiveTab('fixer');
                    }}
                  >
                    Send to Correction Assistant
                  </button>
                </div>
              ))}
            </GlassCard>
          )}

          {activeTab === 'fixer' && (
            <GlassCard variant="elevated" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h3 className="font-editorial" style={{ margin: 0, fontSize: '1.5rem' }}>
                AI Correction Assistant (Minimal-Edit + Independent Validator)
              </h3>
              <form onSubmit={runFixAssistant} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <input
                  className="liquid-glass-inset font-mono"
                  style={{ flex: 1, minWidth: '240px', padding: '10px 12px' }}
                  placeholder="Paste Issue UUID from Auditor or Diagnostic Ledger..."
                  value={issueIdInput}
                  onChange={(e) => setIssueIdInput(e.target.value)}
                  required
                />
                <button type="submit" className="btn btn-primary" disabled={fixBusy}>
                  <Wand2 size={14} /> {fixBusy ? 'Validating Fix...' : 'Generate & Validate'}
                </button>
              </form>

              {fixResult && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <StatusBadge status={fixResult.validation_status} />
                    <span className="font-mono" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      Retries: {fixResult.retry_count} · Human Review Required: {String(fixResult.requires_human_review)}
                    </span>
                  </div>
                  <div className="grid-2">
                    <div className="liquid-glass-inset font-manuscript" style={{ padding: '12px' }}>
                      <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--coral)', marginBottom: '6px' }}>
                        ORIGINAL
                      </div>
                      {fixResult.original_content}
                    </div>
                    <div className="liquid-glass-inset font-manuscript" style={{ padding: '12px' }}>
                      <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--emerald)', marginBottom: '6px' }}>
                        PROPOSED CORRECTION
                      </div>
                      {fixResult.proposed_content}
                    </div>
                  </div>
                  <button type="button" className="btn btn-emerald" onClick={() => void adoptFix()} style={{ alignSelf: 'flex-start' }}>
                    <CheckCircle2 size={14} /> Adopt Correction
                  </button>
                </div>
              )}
            </GlassCard>
          )}

          {activeTab === 'explainer' && (
            <UnavailableNotice
              title="AI Brand Explainer (Freeform Q&A)"
              reason="The existing FastAPI backend does not expose a conversational brand-rule explanation endpoint. Diagnostic explanations are returned per-finding on GET /api/v1/issues."
              endpointNote="Missing backend endpoint: POST /api/v1/guidelines/explain"
            />
          )}

          {activeTab === 'claims' && (
            <GlassCard variant="elevated" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <h3 className="font-editorial" style={{ margin: 0, fontSize: '1.5rem' }}>
                  AI Claim Verifier
                </h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="btn" onClick={() => setClaimText(SAMPLES.claims)}>
                    Load Sample
                  </button>
                  <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                    <FileUp size={14} /> TXT / MD / JSON
                  </button>
                </div>
              </div>

              <form onSubmit={runClaimVerifier} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <textarea
                  className="liquid-glass-inset font-manuscript"
                  rows={5}
                  style={{ padding: '12px' }}
                  value={claimText}
                  onChange={(e) => setClaimText(e.target.value)}
                  placeholder="Enter factual or quantitative claims to verify against backend Claim Registry..."
                  required
                />
                <button type="submit" className="btn btn-primary" disabled={claimBusy} style={{ alignSelf: 'flex-start' }}>
                  <ShieldCheck size={14} /> {claimBusy ? 'Verifying...' : 'Verify Claims via Backend'}
                </button>
              </form>

              {registryClaims.length > 0 && (
                <div className="font-mono" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Compared against {registryClaims.length} authoritative claim(s) in GET /api/v1/claims.
                </div>
              )}

              {claimFindings.map((f) => (
                <div key={f.id} className="liquid-glass-subtle" style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <SeverityBadge severity={f.severity} />
                    <span className="font-mono" style={{ color: 'var(--sky)', fontSize: '0.73rem' }}>
                      {f.rule_ref}
                    </span>
                  </div>
                  <div className="font-manuscript">“{f.evidence}”</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {f.source_ref || 'Escalated for human legal review.'}
                  </div>
                </div>
              ))}
            </GlassCard>
          )}

          {activeTab === 'assistant' && (
            <UnavailableNotice
              title="AI Guideline Assistant (Conversational Q&A)"
              reason="No public FastAPI Q&A endpoint exists for interactive guideline chat. Inspect authoritative guidelines and rules in Workspace 05 (Brand Archive)."
              endpointNote="Missing backend endpoint: POST /api/v1/guidelines/ask"
            />
          )}

          {activeTab === 'patterns' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <GlassCard variant="elevated" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <h3 className="font-editorial" style={{ margin: 0, fontSize: '1.5rem' }}>
                    Recurring Violation Aggregates (Live Backend)
                  </h3>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void loadPatterns()}
                    disabled={patternBusy || !isAnalyticsRole}
                  >
                    {patternBusy ? 'Loading...' : 'Load Backend Aggregates'}
                  </button>
                </div>
                {!isAnalyticsRole && (
                  <div style={{ fontSize: '0.82rem', color: 'var(--amber)' }}>
                    Requires VIEW_ANALYTICS role (brand_manager, legal_reviewer, or brand_admin).
                  </div>
                )}
                {patternData?.most_violated_guidelines.map((item) => (
                  <div
                    key={item.rule_ref}
                    className="liquid-glass-subtle"
                    style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}
                  >
                    <span className="font-mono" style={{ color: 'var(--sky)' }}>{item.rule_ref}</span>
                    <span className="badge badge-coral">{item.count} occurrences</span>
                  </div>
                ))}
              </GlassCard>

              <UnavailableNotice
                title="AI Semantic Pattern Clustering"
                reason="GET /api/v1/analytics/dashboard provides deterministic violation counts only; standalone AI semantic clustering is not implemented in the backend."
                endpointNote="Available: GET /api/v1/analytics/dashboard · Unavailable: POST /api/v1/analytics/patterns"
              />
            </div>
          )}
        </div>

        {/* Session History Sidebar */}
        <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 className="font-editorial" style={{ margin: 0, fontSize: '1.4rem' }}>
            AI Session History
          </h3>
          {studio.aiHistory.length === 0 ? (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Actions executed in AI Intelligence Studio during this session will appear here.
            </div>
          ) : (
            studio.aiHistory.map((item) => (
              <div key={item.id} className="liquid-glass-subtle" style={{ padding: '10px', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <strong>{item.module}</strong>
                  <span className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div style={{ color: item.status === 'error' ? '#fda4af' : 'var(--text-secondary)' }}>
                  {item.summary}
                </div>
              </div>
            ))
          )}
        </GlassCard>
      </div>
    </div>
  );
}
