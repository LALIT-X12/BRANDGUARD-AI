import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CheckSquare, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import {
  ConfirmDialog,
  EmptyState,
  GlassCard,
  LoadingSkeleton,
  SeverityBadge,
  StatusBadge,
  UnavailableNotice,
} from '../components/GlassUI';
import { useApp } from '../contexts/AppContext';
import {
  DEMO_MODE,
  rawGovernanceApi,
  type BackendApproval,
  type BackendAssignment,
  type BackendIssue,
  type BackendSubmission,
} from '../services/api';

export default function ApprovalQueue() {
  const { user, toast, refreshSubmissions } = useApp();
  const [loading, setLoading] = useState(false);
  const [assignments, setAssignments] = useState<BackendAssignment[]>([]);
  const [submissions, setSubmissions] = useState<BackendSubmission[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIssues, setSelectedIssues] = useState<BackendIssue[]>([]);
  const [notes, setNotes] = useState('');
  const [pendingDecision, setPendingDecision] = useState<
    'approved' | 'changes_requested' | 'rejected' | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastApproval, setLastApproval] = useState<BackendApproval | null>(null);

  const isCuratorCapable =
    user?.role === 'Reviewer' || user?.role === 'Brand Admin' || user?.role === 'Tenant Admin';

  const loadQueue = useCallback(async () => {
    if (DEMO_MODE || !isCuratorCapable) return;
    setLoading(true);
    try {
      const [assignList, subList] = await Promise.all([
        rawGovernanceApi.listAssignments(),
        rawGovernanceApi.listSubmissions(100, 0),
      ]);
      setAssignments(assignList);
      setSubmissions(subList);
      setSelectedId((prev) => prev || subList.find((s) => !s.is_locked)?.id || subList[0]?.id || null);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to load curator approval queue.');
    } finally {
      setLoading(false);
    }
  }, [isCuratorCapable, toast]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (!selectedId || DEMO_MODE) return;
    void rawGovernanceApi
      .listIssues({ submissionId: selectedId })
      .then(setSelectedIssues)
      .catch(() => setSelectedIssues([]));
  }, [selectedId]);

  const selectedSub = submissions.find((s) => s.id === selectedId) || null;
  const openCriticalCount = selectedIssues.filter(
    (i) => i.status === 'open' && ['critical', 'high'].includes(i.severity.toLowerCase()),
  ).length;

  const confirmDecision = async () => {
    if (!selectedSub || !pendingDecision) return;
    setSubmitting(true);
    try {
      const approval = await rawGovernanceApi.decideApproval({
        submission_id: selectedSub.id,
        decision: pendingDecision,
        notes: notes.trim() || null,
      });
      setLastApproval(approval);
      setNotes('');
      setPendingDecision(null);
      toast(`Curator decision '${approval.decision}' recorded and audited.`);
      void refreshSubmissions();
      void loadQueue();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Curator decision rejected by backend RBAC.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isCuratorCapable) {
    return (
      <UnavailableNotice
        title="Curator-Only Workspace (RBAC Enforced Server-Side)"
        reason="Approval decisions are strictly protected by FastAPI RBAC (APPROVE_LOW_RISK / APPROVE_REGULATED). AI never automatically approves content. Sign in as a brand_manager, legal_reviewer, or brand_admin."
        endpointNote={`Current role: ${user?.role || 'Creator'} · Endpoints: GET /api/v1/assignments, POST /api/v1/approvals`}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {lastApproval?.decision === 'approved' && lastApproval.locked_version && (
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
                Human Curator Approval Recorded — Version Locked
              </div>
              <div className="font-mono" style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                Approval ID: {lastApproval.id} · Reviewer: {lastApproval.reviewer_id} ·{' '}
                {new Date(lastApproval.created_at).toLocaleString()}
              </div>
              <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Approved version is locked in PostgreSQL and logged in audit_logs. Cryptographic certificate signing is not yet provided by the backend.
              </div>
            </div>
          </div>
          <span className="badge badge-emerald">Locked</span>
        </GlassCard>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
          {assignments.length} routed assignment(s) · {submissions.length} tenant submission(s)
        </div>
        <button type="button" className="btn" onClick={() => void loadQueue()} disabled={loading}>
          <RefreshCw size={14} /> Refresh Queue
        </button>
      </div>

      {loading ? (
        <LoadingSkeleton rows={4} height={70} />
      ) : (
        <div className="studio-grid">
          <GlassCard style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h3 className="font-editorial" style={{ margin: 0, fontSize: '1.45rem' }}>
              Submitted Manuscripts
            </h3>
            {submissions.length === 0 ? (
              <EmptyState
                icon={<CheckSquare size={26} />}
                title="No manuscripts waiting"
                description="Submissions created by creators appear here automatically for human review."
              />
            ) : (
              submissions.map((sub) => {
                const route = assignments.find((a) => a.submission_id === sub.id);
                const selected = sub.id === selectedId;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setSelectedId(sub.id)}
                    className="liquid-glass-subtle"
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      borderColor: selected ? 'rgba(129,140,248,0.6)' : undefined,
                      color: 'var(--text-primary)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '5px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <strong>{sub.title}</strong>
                      <StatusBadge status={sub.status} />
                    </div>
                    <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {sub.channel} · {sub.sensitivity_label} · v{sub.current_version_number}
                    </div>
                    {route && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--sky)' }}>
                        Routed ({route.assigned_role}): {route.routing_reason}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </GlassCard>

          <GlassCard variant="elevated" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {!selectedSub ? (
              <EmptyState
                icon={<ShieldCheck size={28} />}
                title="Select a submission"
                description="Review open critical blockers, audit findings, and issue an authorized human curator decision."
              />
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                  <div>
                    <h3 className="font-editorial" style={{ margin: 0, fontSize: '1.55rem' }}>
                      {selectedSub.title}
                    </h3>
                    <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Author ID: {selectedSub.creator_id} · {new Date(selectedSub.created_at).toLocaleString()}
                    </div>
                  </div>
                  <StatusBadge status={selectedSub.status} />
                </div>

                <div className="liquid-glass-subtle" style={{ padding: '12px', fontSize: '0.82rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '6px' }}>Critical Blocker Checklist</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <span className={`badge ${openCriticalCount === 0 ? 'badge-emerald' : 'badge-coral'}`}>
                      {openCriticalCount} Open Critical / High Blockers
                    </span>
                    <span className="badge badge-indigo">Sensitivity: {selectedSub.sensitivity_label}</span>
                    <span className="badge badge-sky">Intent: {selectedSub.intent}</span>
                  </div>
                  <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                    Note: GET /api/v1/submissions/{'{id}'} returns submission metadata; full raw manuscript body retrieval is not yet exposed as a separate field.
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
                  {selectedIssues.length === 0 ? (
                    <div style={{ fontSize: '0.82rem', color: 'var(--emerald)' }}>
                      Zero diagnostic violations recorded for this submission.
                    </div>
                  ) : (
                    selectedIssues.map((issue) => (
                      <div key={issue.id} className="liquid-glass-subtle" style={{ padding: '10px', fontSize: '0.8rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <SeverityBadge severity={issue.severity} />
                          <span className="font-mono" style={{ color: 'var(--sky)', fontSize: '0.72rem' }}>
                            {issue.rule_ref}
                          </span>
                        </div>
                        <div className="font-manuscript">“{issue.evidence}”</div>
                      </div>
                    ))
                  )}
                </div>

                <label className="field" style={{ marginTop: 0 }}>
                  <span>Curator Notes / Revision Instructions</span>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Record approval rationale or required revision changes..."
                    disabled={selectedSub.is_locked}
                  />
                </label>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-emerald"
                    disabled={selectedSub.is_locked || submitting}
                    onClick={() => setPendingDecision('approved')}
                  >
                    <CheckCircle2 size={14} /> Approve & Lock Version
                  </button>
                  <button
                    type="button"
                    className="btn btn-amber"
                    disabled={selectedSub.is_locked || submitting}
                    onClick={() => setPendingDecision('changes_requested')}
                  >
                    Request Revisions
                  </button>
                  <button
                    type="button"
                    className="btn btn-coral"
                    disabled={selectedSub.is_locked || submitting}
                    onClick={() => setPendingDecision('rejected')}
                  >
                    <XCircle size={14} /> Reject
                  </button>
                </div>
              </>
            )}
          </GlassCard>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDecision)}
        title={`Confirm Curator Decision: ${(pendingDecision || '').replace(/_/g, ' ')}`}
        message={
          pendingDecision === 'approved'
            ? 'Approving permanently locks this content version in PostgreSQL and appends an immutable audit log entry under your curator account.'
            : 'This human curator decision will be logged in the immutable audit trail.'
        }
        confirmLabel={pendingDecision === 'approved' ? 'Approve & Lock' : 'Confirm Decision'}
        tone={pendingDecision === 'approved' ? 'emerald' : pendingDecision === 'rejected' ? 'coral' : 'amber'}
        busy={submitting}
        onConfirm={() => void confirmDecision()}
        onCancel={() => setPendingDecision(null)}
      />
    </div>
  );
}
