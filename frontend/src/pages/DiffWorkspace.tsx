import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Columns2, FileDiff, Rows3, XCircle } from 'lucide-react';
import { EmptyState, GlassCard, StatusBadge } from '../components/GlassUI';
import { useApp } from '../contexts/AppContext';
import { useStudio } from '../contexts/StudioContext';
import { fixesApi } from '../services/api';
import { computeWordDiff } from '../utils/textDiff';

export default function DiffWorkspace() {
  const { studio, setStudio } = useStudio();
  const { toast } = useApp();
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  const [selectedFixId, setSelectedFixId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const fixList = useMemo(() => Object.values(studio.fixMap), [studio.fixMap]);
  const activeFix = fixList.find((f) => f.id === selectedFixId) || fixList[0] || null;
  const linkedIssue = activeFix
    ? studio.issues.find((i) => i.id === activeFix.issue_id) || null
    : null;

  const originalText = activeFix ? activeFix.original_content : studio.originalText;
  const revisedText = activeFix ? activeFix.proposed_content : studio.currentText;

  const diff = useMemo(
    () => computeWordDiff(originalText || '', revisedText || ''),
    [originalText, revisedText],
  );

  const handleDecision = async (decision: 'accepted' | 'rejected') => {
    if (!activeFix) return;
    setBusy(true);
    try {
      const updated = await fixesApi.decide(activeFix.id, decision);
      setStudio((prev) => ({
        ...prev,
        currentText: decision === 'accepted' ? updated.proposed_content : prev.currentText,
        fixMap: { ...prev.fixMap, [activeFix.issue_id]: updated },
        issues: prev.issues.map((i) =>
          i.id === activeFix.issue_id && decision === 'accepted' ? { ...i, status: 'fixed' } : i,
        ),
        ledger: [
          {
            id: updated.id,
            timestamp: new Date().toISOString(),
            action: decision === 'accepted' ? 'adopted' : 'dismissed',
            ruleRef: linkedIssue?.rule_ref || 'FIX',
            evidence: linkedIssue?.evidence || 'Proposed fix',
            validationStatus: updated.validation_status,
          },
          ...prev.ledger,
        ],
      }));
      toast(`Fix ${decision} via POST /api/v1/fixes/${activeFix.id}/decision.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to apply fix decision.');
    } finally {
      setBusy(false);
    }
  };

  if (!originalText && !revisedText) {
    return (
      <EmptyState
        icon={<FileDiff size={32} />}
        title="No manuscript comparison loaded"
        description="Submit a manuscript in Review Studio and generate or adopt a correction to inspect word-level additions and removals."
        action={
          <button type="button" className="btn btn-primary" onClick={() => navigate('/review-studio')}>
            Open Review Studio
          </button>
        }
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Diff Controls & Change Telemetry */}
      <GlassCard style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span className="badge badge-emerald font-mono">+{diff.addedWords} words</span>
          <span className="badge badge-coral font-mono">-{diff.removedWords} words</span>
          <span className="badge badge-indigo font-mono">{diff.changePercent}% delta</span>
          {activeFix && <StatusBadge status={activeFix.validation_status} />}
          {linkedIssue && (
            <span className="font-mono" style={{ fontSize: '0.74rem', color: 'var(--sky)' }}>
              Rule: {linkedIssue.rule_ref}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {fixList.length > 1 && (
            <select
              className="liquid-glass-inset"
              style={{ padding: '6px 10px', fontSize: '0.78rem' }}
              value={activeFix?.id || ''}
              onChange={(e) => setSelectedFixId(e.target.value)}
            >
              {fixList.map((f, idx) => (
                <option key={f.id} value={f.id}>
                  Fix #{idx + 1} ({f.validation_status})
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className={`btn ${viewMode === 'unified' ? 'btn-primary' : ''}`}
            style={{ padding: '6px 10px', fontSize: '0.76rem' }}
            onClick={() => setViewMode('unified')}
          >
            <Rows3 size={14} /> Inline Word Diff
          </button>
          <button
            type="button"
            className={`btn ${viewMode === 'split' ? 'btn-primary' : ''}`}
            style={{ padding: '6px 10px', fontSize: '0.76rem' }}
            onClick={() => setViewMode('split')}
          >
            <Columns2 size={14} /> Split View
          </button>
        </div>
      </GlassCard>

      {viewMode === 'unified' ? (
        <GlassCard variant="elevated">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 className="font-editorial" style={{ margin: 0, fontSize: '1.5rem' }}>
              Word-Level LCS Diff Comparison
            </h3>
            {activeFix && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-emerald"
                  disabled={busy || activeFix.creator_decision === 'accepted'}
                  onClick={() => void handleDecision('accepted')}
                >
                  <CheckCircle2 size={14} /> Accept Correction
                </button>
                <button
                  type="button"
                  className="btn btn-coral"
                  disabled={busy || activeFix.creator_decision === 'rejected'}
                  onClick={() => void handleDecision('rejected')}
                >
                  <XCircle size={14} /> Reject
                </button>
              </div>
            )}
          </div>

          <div
            className="liquid-glass-inset font-manuscript"
            style={{ padding: '18px', fontSize: '1.03rem', whiteSpace: 'pre-wrap', lineHeight: 1.85 }}
          >
            {diff.tokens.map((tok, i) =>
              tok.type === 'add' ? (
                <ins key={i} className="diff-token-add" style={{ textDecoration: 'none' }}>
                  {tok.value}
                </ins>
              ) : tok.type === 'del' ? (
                <del key={i} className="diff-token-del">
                  {tok.value}
                </del>
              ) : (
                <span key={i}>{tok.value}</span>
              ),
            )}
          </div>
        </GlassCard>
      ) : (
        <div className="grid-2">
          <GlassCard>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 className="font-editorial" style={{ margin: 0, fontSize: '1.45rem' }}>
                Original Manuscript
              </h3>
              <span className="badge badge-coral">Removals Highlighted</span>
            </div>
            <div className="liquid-glass-inset font-manuscript" style={{ padding: '16px', whiteSpace: 'pre-wrap', minHeight: '200px' }}>
              {diff.tokens
                .filter((t) => t.type !== 'add')
                .map((tok, i) =>
                  tok.type === 'del' ? (
                    <del key={i} className="diff-token-del">
                      {tok.value}
                    </del>
                  ) : (
                    <span key={i}>{tok.value}</span>
                  ),
                )}
            </div>
          </GlassCard>

          <GlassCard>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 className="font-editorial" style={{ margin: 0, fontSize: '1.45rem' }}>
                Revised Manuscript
              </h3>
              <span className="badge badge-emerald">Additions Highlighted</span>
            </div>
            <div className="liquid-glass-inset font-manuscript" style={{ padding: '16px', whiteSpace: 'pre-wrap', minHeight: '200px' }}>
              {diff.tokens
                .filter((t) => t.type !== 'del')
                .map((tok, i) =>
                  tok.type === 'add' ? (
                    <ins key={i} className="diff-token-add" style={{ textDecoration: 'none' }}>
                      {tok.value}
                    </ins>
                  ) : (
                    <span key={i}>{tok.value}</span>
                  ),
                )}
            </div>
          </GlassCard>
        </div>
      )}

      <GlassCard>
        <h3 className="font-editorial" style={{ margin: '0 0 12px', fontSize: '1.45rem' }}>
          Reconciliation Action Ledger
        </h3>
        {studio.ledger.length === 0 ? (
          <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
            No corrections accepted, edited, or rejected during this session yet.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Guideline Ref</th>
                  <th>Flagged Passage</th>
                  <th>Validator Status</th>
                </tr>
              </thead>
              <tbody>
                {studio.ledger.map((row) => (
                  <tr key={`${row.id}-${row.timestamp}`}>
                    <td className="font-mono" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      {new Date(row.timestamp).toLocaleTimeString()}
                    </td>
                    <td>
                      <StatusBadge status={row.action} />
                    </td>
                    <td className="font-mono" style={{ color: 'var(--sky)' }}>
                      {row.ruleRef}
                    </td>
                    <td className="font-manuscript">“{row.evidence}”</td>
                    <td>
                      <StatusBadge status={row.validationStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
