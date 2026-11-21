import React, { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  FileDiff,
  FileUp,
  Flag,
  Info,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  EmptyState,
  GlassCard,
  LoadingSkeleton,
  SeverityBadge,
  StatusBadge,
} from '../components/GlassUI';
import { useApp } from '../contexts/AppContext';
import { useStudio } from '../contexts/StudioContext';
import {
  DEMO_MODE,
  disputesApi,
  fixesApi,
  rawGovernanceApi,
  reviewsApi,
  type BackendFix,
  type BackendIssue,
  type BackendSubmission,
} from '../services/api';

const CHANNELS = [
  { value: 'social', label: 'Social' },
  { value: 'blog', label: 'Blog' },
  { value: 'press', label: 'Press' },
  { value: 'landing', label: 'Landing' },
] as const;

const SAMPLE_MANUSCRIPT = {
  title: 'Q4 Enterprise Platform Launch Copy',
  channel: 'landing' as const,
  audience: 'Enterprise IT & Security Leaders',
  intent: 'Introduce reliability metrics and enterprise compliance controls accurately',
  sensitivity: 'regulated' as const,
  text: 'Act now for our #1 cloud governance platform! Our architecture delivers 100% guaranteed zero risk protection with instant results for every department. Last chance to upgrade today!!!',
};

export default function ReviewStudio() {
  const { toast, refreshSubmissions } = useApp();
  const { studio, setStudio } = useStudio();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [savedSubmissions, setSavedSubmissions] = useState<BackendSubmission[]>([]);
  const [metadataOnlyMode, setMetadataOnlyMode] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [auditing, setAuditing] = useState(false);
  const [fixingId, setFixingId] = useState<string | null>(null);

  const [editingFixId, setEditingFixId] = useState<string | null>(null);
  const [manualFixText, setManualFixText] = useState('');

  const [disputeIssue, setDisputeIssue] = useState<BackendIssue | null>(null);
  const [disputeReason, setDisputeReason] = useState('guideline_ambiguity');
  const [disputeExplanation, setDisputeExplanation] = useState('');
  const [submittingDispute, setSubmittingDispute] = useState(false);

  const loadSavedSubmissions = useCallback(async () => {
    if (DEMO_MODE) return;
    try {
      const list = await rawGovernanceApi.listSubmissions(30, 0);
      setSavedSubmissions(list);
    } catch {
      // Non-blocking
    }
  }, []);

  useEffect(() => {
    void loadSavedSubmissions();
  }, [loadSavedSubmissions]);

  const wordCount = useMemo(() => {
    const t = studio.currentText.trim();
    return t ? t.split(/\s+/).length : 0;
  }, [studio.currentText]);

  const readingTimeMin = Math.max(1, Math.ceil(wordCount / 220));

  const startFreshDraft = () => {
    setMetadataOnlyMode(false);
    setFocusedIndex(0);
    setStudio((prev) => ({
      ...prev,
      title: '',
      originalText: '',
      currentText: '',
      submission: null,
      reviewSession: null,
      issues: [],
      fixMap: {},
    }));
  };

  const selectExistingSubmission = async (subId: string) => {
    if (!subId) {
      startFreshDraft();
      return;
    }
    const foundSub = savedSubmissions.find((s) => s.id === subId);
    if (!foundSub) return;

    setAuditing(true);
    try {
      const issues = await rawGovernanceApi.listIssues({ submissionId: foundSub.id });
      const isSameLocalDraft = studio.submission?.id === foundSub.id && Boolean(studio.currentText);
      setMetadataOnlyMode(!isSameLocalDraft);
      setFocusedIndex(0);
      setStudio((prev) => ({
        ...prev,
        title: foundSub.title,
        channel: (['social', 'blog', 'press', 'landing'].includes(foundSub.channel)
          ? foundSub.channel
          : 'landing') as 'social' | 'blog' | 'press' | 'landing',
        audience: foundSub.audience,
        intent: foundSub.intent,
        sensitivity: (['public', 'internal', 'confidential', 'regulated'].includes(foundSub.sensitivity_label)
          ? foundSub.sensitivity_label
          : 'internal') as 'public' | 'internal' | 'confidential' | 'regulated',
        submission: foundSub,
        issues,
      }));
      toast(`Loaded submission "${foundSub.title}" (${issues.length} diagnostic(s)).`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to load submission diagnostics.');
    } finally {
      setAuditing(false);
    }
  };

  const loadSample = () => {
    setMetadataOnlyMode(false);
    setStudio((prev) => ({
      ...prev,
      title: SAMPLE_MANUSCRIPT.title,
      channel: SAMPLE_MANUSCRIPT.channel,
      audience: SAMPLE_MANUSCRIPT.audience,
      intent: SAMPLE_MANUSCRIPT.intent,
      sensitivity: SAMPLE_MANUSCRIPT.sensitivity,
      originalText: SAMPLE_MANUSCRIPT.text,
      currentText: SAMPLE_MANUSCRIPT.text,
      submission: null,
      reviewSession: null,
      issues: [],
    }));
    toast('Loaded illustrative sample manuscript for live backend auditing.');
  };

  const handleFileImport = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'txt' || ext === 'md' || ext === 'json') {
      const content = await file.text();
      setMetadataOnlyMode(false);
      setStudio((prev) => ({
        ...prev,
        title: prev.title || file.name.replace(/\.[^.]+$/, ''),
        originalText: prev.originalText || content,
        currentText: content,
      }));
      toast(`Loaded ${file.name} into the Manuscript Desk.`);
      return;
    }

    const fmtMap: Record<string, 'docx' | 'pdf' | 'html' | 'image'> = {
      docx: 'docx',
      pdf: 'pdf',
      html: 'html',
      htm: 'html',
      png: 'image',
      jpg: 'image',
      jpeg: 'image',
      webp: 'image',
    };
    const contentFormat = fmtMap[ext];
    if (!contentFormat) {
      toast('Unsupported file format. Supported: TXT, MD, JSON, HTML, DOCX, PDF, PNG/JPG/WEBP.');
      return;
    }

    setAuditing(true);
    try {
      const sub = await rawGovernanceApi.uploadFile({
        title: studio.title.trim() || file.name,
        channel: studio.channel,
        audience: studio.audience.trim() || 'enterprise',
        intent: studio.intent.trim() || 'document compliance audit',
        content_format: contentFormat,
        sensitivity_label: studio.sensitivity,
        file,
      });
      const session = await reviewsApi.start(sub.id);
      const found = await rawGovernanceApi.listIssues({ submissionId: sub.id, reviewSessionId: session.id });
      setMetadataOnlyMode(true);
      setFocusedIndex(0);
      setStudio((prev) => ({
        ...prev,
        title: sub.title,
        submission: sub,
        reviewSession: session,
        issues: found,
      }));
      void refreshSubmissions();
      void loadSavedSubmissions();
      toast(`Uploaded ${file.name} and completed backend audit (${found.length} findings).`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'File upload audit failed.');
    } finally {
      setAuditing(false);
    }
  };

  const handleRunAudit = async () => {
    if (!studio.title.trim() || !studio.currentText.trim()) {
      toast('Enter a title and manuscript text to run a backend audit.');
      return;
    }
    setAuditing(true);
    setMetadataOnlyMode(false);
    try {
      const sub = await rawGovernanceApi.submitText({
        title: studio.title.trim(),
        channel: studio.channel,
        audience: studio.audience.trim() || 'enterprise buyers',
        intent: studio.intent.trim() || 'pre-publication marketing copy',
        content_format: 'text',
        sensitivity_label: studio.sensitivity,
        raw_text: studio.currentText,
      });
      const session = await reviewsApi.start(sub.id);
      const found = await rawGovernanceApi.listIssues({
        submissionId: sub.id,
        reviewSessionId: session.id,
      });
      setFocusedIndex(0);
      setStudio((prev) => ({
        ...prev,
        originalText: prev.originalText || prev.currentText,
        submission: sub,
        reviewSession: session,
        issues: found,
      }));
      void refreshSubmissions();
      void loadSavedSubmissions();
      toast(`Audit completed · Risk: ${session.risk_level || 'low'} · ${found.length} finding(s).`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Backend audit failed.');
    } finally {
      setAuditing(false);
    }
  };

  const handleRequestFix = async (issue: BackendIssue) => {
    setFixingId(issue.id);
    try {
      const fix = await fixesApi.request(issue.id);
      setStudio((prev) => ({
        ...prev,
        originalText: prev.originalText || fix.original_content,
        currentText: prev.currentText || fix.original_content,
        fixMap: { ...prev.fixMap, [issue.id]: fix },
      }));
      setMetadataOnlyMode(false);
      toast(
        fix.validation_status === 'validated'
          ? 'Backend validator passed the minimal-edit correction.'
          : 'Correction generated — requires human review (automated validation failed).',
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Fix generation failed.');
    } finally {
      setFixingId(null);
    }
  };

  const handleDecideFix = async (
    issue: BackendIssue,
    fix: BackendFix,
    decision: 'accepted' | 'edited' | 'rejected',
    editedContent?: string,
  ) => {
    try {
      const updated = await fixesApi.decide(fix.id, decision, editedContent);
      const refreshedIssues = studio.submission
        ? await rawGovernanceApi.listIssues({ submissionId: studio.submission.id })
        : studio.issues.map((i) =>
            i.id === issue.id && decision !== 'rejected' ? { ...i, status: 'fixed' } : i,
          );
      setStudio((prev) => ({
        ...prev,
        currentText: decision === 'rejected' ? prev.currentText : updated.proposed_content || prev.currentText,
        fixMap: { ...prev.fixMap, [issue.id]: updated },
        issues: refreshedIssues,
        ledger: [
          {
            id: updated.id,
            timestamp: new Date().toISOString(),
            action: decision === 'accepted' ? 'adopted' : decision === 'edited' ? 'edited' : 'dismissed',
            ruleRef: issue.rule_ref,
            evidence: issue.evidence,
            validationStatus: updated.validation_status,
          },
          ...prev.ledger,
        ],
      }));
      setEditingFixId(null);
      setManualFixText('');
      toast(`Fix ${decision} and recorded in backend reconciliation history.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : `Could not mark fix as ${decision}.`);
    }
  };

  const handleSubmitDispute = async (e: FormEvent) => {
    e.preventDefault();
    if (!disputeIssue) return;
    setSubmittingDispute(true);
    try {
      await disputesApi.create({
        issueId: disputeIssue.id,
        reasonCode: disputeReason,
        explanation: disputeExplanation.trim(),
      });
      const refreshed = studio.submission
        ? await rawGovernanceApi.listIssues({ submissionId: studio.submission.id })
        : studio.issues;
      setStudio((prev) => ({ ...prev, issues: refreshed }));
      toast('Dispute recorded for human curator review.');
      setDisputeIssue(null);
      setDisputeExplanation('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Dispute submission failed.');
    } finally {
      setSubmittingDispute(false);
    }
  };

  const focusedIssue = studio.issues[focusedIndex] || null;

  const highlightedPreview = useMemo(() => {
    if (metadataOnlyMode || !studio.currentText) return null;
    const spans = studio.issues
      .filter((i) => i.status === 'open' && i.evidence && studio.currentText.includes(i.evidence))
      .map((i) => i.evidence);
    if (!spans.length) return null;
    const escaped = spans.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(`(${escaped.join('|')})`, 'g');
    return studio.currentText.split(re).map((part, idx) => {
      if (!spans.includes(part)) return <React.Fragment key={idx}>{part}</React.Fragment>;
      const isFocused = focusedIssue?.evidence === part;
      return (
        <mark
          key={idx}
          style={{
            background: isFocused ? 'rgba(244,63,94,0.42)' : 'rgba(244,63,94,0.2)',
            color: '#fff1f2',
            padding: '1px 4px',
            borderRadius: '4px',
            borderBottom: isFocused ? '2px solid #fb7185' : '1px dashed var(--coral)',
          }}
        >
          {part}
        </mark>
      );
    });
  }, [studio.currentText, studio.issues, metadataOnlyMode, focusedIssue]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Submission Selector Bar */}
      <GlassCard style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
          <span className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            ACTIVE SUBMISSION
          </span>
          <select
            className="liquid-glass-inset"
            style={{ padding: '7px 11px', minWidth: '240px', maxWidth: '380px', flex: 1 }}
            value={studio.submission?.id || ''}
            onChange={(e) => void selectExistingSubmission(e.target.value)}
            aria-label="Select submission"
          >
            <option value="">+ New Manuscript Draft</option>
            {savedSubmissions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.channel} · v{s.current_version_number} · {s.status})
              </option>
            ))}
          </select>
          <button type="button" className="btn" style={{ padding: '7px 10px' }} onClick={startFreshDraft}>
            <Plus size={14} /> New Draft
          </button>
        </div>

        {studio.reviewSession && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <StatusBadge status={studio.reviewSession.status} />
            {studio.reviewSession.risk_level && (
              <SeverityBadge severity={studio.reviewSession.risk_level} />
            )}
          </div>
        )}
      </GlassCard>

      {studio.submission?.is_locked && studio.submission?.status === 'approved' && (
        <GlassCard
          variant="elevated"
          style={{
            borderColor: 'rgba(16,185,129,0.55)',
            background: 'rgba(16,185,129,0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ShieldCheck size={24} color="var(--emerald)" />
            <div>
              <div style={{ fontWeight: 700, color: '#a7f3d0' }}>
                Human Curator Clearance Recorded — Version Locked (v{studio.submission.current_version_number})
              </div>
              <div className="font-mono" style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                Submission ID: {studio.submission.id} (Cryptographic certificate signing unavailable in backend)
              </div>
            </div>
          </div>
          <span className="badge badge-emerald">Approved & Locked</span>
        </GlassCard>
      )}

      <div className="studio-grid">
        {/* MAIN PANEL: MANUSCRIPT EDITOR (Majority Width) */}
        <GlassCard variant="elevated" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h2 className="font-editorial" style={{ margin: 0, fontSize: '1.65rem' }}>
                Manuscript Desk
              </h2>
              <div style={{ fontSize: '0.77rem', color: 'var(--text-muted)' }}>
                Compose, upload, audit, and reconcile content against brand policies
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {CHANNELS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`btn ${studio.channel === c.value ? 'btn-primary' : ''}`}
                  style={{ padding: '6px 11px', fontSize: '0.75rem' }}
                  onClick={() => setStudio((p) => ({ ...p, channel: c.value }))}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {metadataOnlyMode && studio.submission && (
            <div
              className="liquid-glass-subtle"
              style={{
                padding: '12px 14px',
                borderColor: 'rgba(56,189,248,0.35)',
                background: 'rgba(56,189,248,0.06)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                fontSize: '0.8rem',
              }}
            >
              <Info size={16} color="var(--sky)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Historical Submission Metadata View:</strong>{' '}
                <code>GET /api/v1/submissions/{'{id}'}</code> returns submission metadata only (not stored{' '}
                <code>ContentVersion.raw_text</code>). BrandGuard never fabricates source text. Requesting a fix on any diagnostic will retrieve its grounded <code>original_content</code> from the backend, or paste/edit fresh copy below to submit a new audit.
              </div>
            </div>
          )}

          <div className="grid-3">
            <label className="field" style={{ marginTop: 0 }}>
              <span>Manuscript Title</span>
              <input
                value={studio.title}
                onChange={(e) => setStudio((p) => ({ ...p, title: e.target.value }))}
                placeholder="Q4 Product Launch Copy"
              />
            </label>
            <label className="field" style={{ marginTop: 0 }}>
              <span>Target Audience</span>
              <input
                value={studio.audience}
                onChange={(e) => setStudio((p) => ({ ...p, audience: e.target.value }))}
                placeholder="Enterprise Buyers"
              />
            </label>
            <label className="field" style={{ marginTop: 0 }}>
              <span>Sensitivity Label</span>
              <select
                value={studio.sensitivity}
                onChange={(e) =>
                  setStudio((p) => ({
                    ...p,
                    sensitivity: e.target.value as 'public' | 'internal' | 'confidential' | 'regulated',
                  }))
                }
              >
                <option value="public">Public</option>
                <option value="internal">Internal</option>
                <option value="confidential">Confidential (Legal Reviewer)</option>
                <option value="regulated">Regulated (Legal Reviewer)</option>
              </select>
            </label>
          </div>

          <label className="field" style={{ marginTop: 0 }}>
            <span>Creator Intent Card (passed to independent fix validator)</span>
            <input
              value={studio.intent}
              onChange={(e) => setStudio((p) => ({ ...p, intent: e.target.value }))}
              placeholder="Communicate service reliability accurately without absolute guarantees"
            />
          </label>

          <label className="field" style={{ marginTop: 0 }}>
            <span>Manuscript Content</span>
            <textarea
              className="font-manuscript"
              rows={11}
              style={{ fontSize: '1rem' }}
              value={studio.currentText}
              onChange={(e) => {
                setMetadataOnlyMode(false);
                setStudio((p) => ({ ...p, currentText: e.target.value }));
              }}
              placeholder="Write or paste content here, click Load Sample, or upload TXT/MD/JSON/HTML/DOCX/PDF..."
            />
          </label>

          {highlightedPreview && (
            <div className="liquid-glass-subtle" style={{ padding: '12px 14px' }}>
              <div className="font-mono" style={{ fontSize: '0.69rem', color: 'var(--coral)', marginBottom: '6px' }}>
                HIGHLIGHTED DIAGNOSTIC PASSAGES (FOCUSED ISSUE BRIGHTENED)
              </div>
              <div className="font-manuscript" style={{ fontSize: '0.95rem' }}>
                {highlightedPreview}
              </div>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
              paddingTop: '8px',
              borderTop: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div className="font-mono" style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', gap: '14px' }}>
              <span>{wordCount} words</span>
              <span>~{readingTimeMin} min read</span>
              {studio.submission && <span>v{studio.submission.current_version_number}</span>}
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.json,.html,.docx,.pdf,.png,.jpg,.jpeg,.webp"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFileImport(f);
                  e.target.value = '';
                }}
              />
              <button type="button" className="btn" onClick={loadSample}>
                Load Sample
              </button>
              <button type="button" className="btn" onClick={() => fileInputRef.current?.click()} disabled={auditing}>
                <FileUp size={14} /> Upload
              </button>
              <button type="button" className="btn" onClick={() => navigate('/diff')} disabled={!studio.originalText}>
                <FileDiff size={14} /> Compare Diff
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void handleRunAudit()} disabled={auditing}>
                {auditing ? <RefreshCw size={14} /> : <Play size={14} />}
                {auditing ? 'Auditing...' : studio.submission && !metadataOnlyMode ? 'Re-run Audit' : 'Submit & Audit'}
              </button>
            </div>
          </div>
        </GlassCard>

        {/* SECONDARY PANEL: DIAGNOSTIC MARGINALIA WITH ISSUE NAVIGATION */}
        <GlassCard variant="floating" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <div>
              <h2 className="font-editorial" style={{ margin: 0, fontSize: '1.5rem' }}>
                Diagnostic Marginalia
              </h2>
              <div className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {studio.issues.length} issue(s) detected
              </div>
            </div>

            {studio.issues.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '5px 7px' }}
                  onClick={() => setFocusedIndex((i) => (i - 1 + studio.issues.length) % studio.issues.length)}
                  aria-label="Previous issue"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  {focusedIndex + 1}/{studio.issues.length}
                </span>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '5px 7px' }}
                  onClick={() => setFocusedIndex((i) => (i + 1) % studio.issues.length)}
                  aria-label="Next issue"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>

          {auditing ? (
            <LoadingSkeleton rows={3} height={94} />
          ) : studio.issues.length === 0 ? (
            <EmptyState
              icon={<Upload size={26} />}
              title={studio.submission ? 'Zero open discrepancies' : 'Ready for pre-publication review'}
              description={
                studio.submission
                  ? 'No violations were flagged for this submission. Proceed to Approval Queue for human curator clearance.'
                  : 'Submit text or upload a file to inspect explainable diagnostics and validated minimal-edit corrections.'
              }
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '720px', overflowY: 'auto', paddingRight: '2px' }}>
              {studio.issues.map((issue, idx) => {
                const fix = studio.fixMap[issue.id];
                const focused = idx === focusedIndex;
                const isEditing = editingFixId === fix?.id;
                return (
                  <div
                    key={issue.id}
                    onClick={() => setFocusedIndex(idx)}
                    className="liquid-glass-subtle"
                    style={{
                      padding: '13px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      cursor: 'pointer',
                      borderColor: focused ? 'rgba(134, 201, 245, 0.55)' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <SeverityBadge severity={issue.severity} />
                        <StatusBadge status={issue.status} />
                      </div>
                      <span className="font-mono" style={{ fontSize: '0.71rem', color: 'var(--sky)' }}>
                        {issue.rule_ref}
                      </span>
                    </div>

                    <div
                      className="font-manuscript"
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: 'rgba(244,63,94,0.09)',
                        borderLeft: '2px solid var(--coral)',
                        fontSize: '0.88rem',
                      }}
                    >
                      “{issue.evidence}”
                    </div>

                    {issue.source_ref && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                        {issue.source_ref}
                      </div>
                    )}

                    <div className="font-mono" style={{ fontSize: '0.69rem', color: 'var(--text-muted)' }}>
                      {issue.category} · {issue.checker_type} · {Math.round(issue.confidence * 100)}%
                    </div>

                    {issue.suggested_fix && !fix && (
                      <div style={{ fontSize: '0.8rem', color: '#a7f3d0' }}>Hint: {issue.suggested_fix}</div>
                    )}

                    {fix && (
                      <div className="liquid-glass-inset" style={{ padding: '10px', fontSize: '0.81rem', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="font-mono" style={{ fontSize: '0.67rem', color: 'var(--accent-violet)' }}>
                            PROPOSED FIX (Retries: {fix.retry_count})
                          </span>
                          <StatusBadge status={fix.validation_status} />
                        </div>

                        {isEditing ? (
                          <textarea
                            className="liquid-glass-inset font-manuscript"
                            rows={4}
                            style={{ padding: '8px', fontSize: '0.86rem' }}
                            value={manualFixText}
                            onChange={(e) => setManualFixText(e.target.value)}
                          />
                        ) : (
                          <div className="font-manuscript">{fix.proposed_content}</div>
                        )}

                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-emerald"
                                style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                                onClick={() => void handleDecideFix(issue, fix, 'edited', manualFixText)}
                              >
                                Save Manual Edit
                              </button>
                              <button
                                type="button"
                                className="btn"
                                style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                                onClick={() => setEditingFixId(null)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn btn-emerald"
                                style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                                onClick={() => void handleDecideFix(issue, fix, 'accepted')}
                                disabled={fix.creator_decision === 'accepted'}
                              >
                                <CheckCircle2 size={13} /> Adopt
                              </button>
                              <button
                                type="button"
                                className="btn"
                                style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                                onClick={() => {
                                  setEditingFixId(fix.id);
                                  setManualFixText(fix.proposed_content);
                                }}
                              >
                                <Edit3 size={12} /> Edit
                              </button>
                              <button
                                type="button"
                                className="btn"
                                style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                                onClick={() => void handleDecideFix(issue, fix, 'rejected')}
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: '6px 10px', fontSize: '0.74rem' }}
                        onClick={() => void handleRequestFix(issue)}
                        disabled={fixingId === issue.id || issue.status === 'fixed'}
                      >
                        <Sparkles size={13} />
                        {fixingId === issue.id ? 'Validating...' : 'Generate & Validate Fix'}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '6px 10px', fontSize: '0.74rem' }}
                        onClick={() => setDisputeIssue(issue)}
                        disabled={issue.status === 'disputed'}
                      >
                        <Flag size={13} /> Dispute
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      </div>

      {disputeIssue && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="liquid-glass-floating" style={{ width: '100%', maxWidth: '460px', padding: '24px' }}>
            <h3 className="font-editorial" style={{ marginTop: 0, fontSize: '1.55rem' }}>
              Dispute Diagnostic Finding
            </h3>
            <p className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--sky)' }}>
              Rule: {disputeIssue.rule_ref}
            </p>
            <form onSubmit={handleSubmitDispute} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label className="field" style={{ marginTop: 0 }}>
                <span>Reason Code</span>
                <select value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)}>
                  <option value="guideline_ambiguity">Guideline Ambiguity</option>
                  <option value="approved_exception">Approved Campaign Exception</option>
                  <option value="false_positive">False Positive</option>
                  <option value="context_misread">Context Misread</option>
                </select>
              </label>
              <label className="field" style={{ marginTop: 0 }}>
                <span>Creator Explanation</span>
                <textarea
                  rows={4}
                  value={disputeExplanation}
                  onChange={(e) => setDisputeExplanation(e.target.value)}
                  minLength={5}
                  required
                />
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn" onClick={() => setDisputeIssue(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-amber" disabled={submittingDispute}>
                  {submittingDispute ? 'Submitting...' : 'Submit Dispute'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
