import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Palette,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { EmptyState, GlassCard, LoadingSkeleton, SeverityBadge } from '../components/GlassUI';
import { useApp } from '../contexts/AppContext';
import {
  claimsApi,
  DEMO_MODE,
  glossaryApi,
  guidelinesApi,
  rawGovernanceApi,
  type BackendClaim,
  type BackendGlossaryEntry,
  type BackendGuideline,
  type BackendGuidelineRule,
  type BackendVisualAsset,
} from '../services/api';

export default function BrandArchive() {
  const { user, toast } = useApp();
  const [tab, setTab] = useState<'guidelines' | 'glossary' | 'claims' | 'assets'>('guidelines');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const [guidelines, setGuidelines] = useState<BackendGuideline[]>([]);
  const [rulesByGuideline, setRulesByGuideline] = useState<Record<string, BackendGuidelineRule[]>>({});
  const [glossary, setGlossary] = useState<BackendGlossaryEntry[]>([]);
  const [claims, setClaims] = useState<BackendClaim[]>([]);
  const [staleClaims, setStaleClaims] = useState<BackendClaim[]>([]);
  const [assets, setAssets] = useState<BackendVisualAsset[]>([]);

  // Admin creation inputs
  const [newTerm, setNewTerm] = useState('');
  const [newTermStatus, setNewTermStatus] = useState<'prohibited' | 'approved'>('prohibited');
  const [newPreferred, setNewPreferred] = useState('');

  const [newClaimCode, setNewClaimCode] = useState('');
  const [newClaimStatement, setNewClaimStatement] = useState('');
  const [newClaimRegulated, setNewClaimRegulated] = useState(false);

  const isAdmin = user?.role === 'Brand Admin' || user?.role === 'Tenant Admin';

  const loadArchive = useCallback(async () => {
    if (DEMO_MODE) return;
    setLoading(true);
    try {
      const [gList, glList, cList, staleList, aList] = await Promise.all([
        rawGovernanceApi.listRawGuidelines(),
        rawGovernanceApi.listRawGlossary(),
        rawGovernanceApi.listRawClaims(),
        rawGovernanceApi.listStaleClaims(),
        rawGovernanceApi.listAssets(),
      ]);
      setGuidelines(gList);
      setGlossary(glList);
      setClaims(cList);
      setStaleClaims(staleList);
      setAssets(aList);

      if (gList.length) {
        const entries = await Promise.all(
          gList.slice(0, 12).map(async (g) => {
            const rules = await guidelinesApi.rules(g.id);
            return [g.id, rules] as const;
          }),
        );
        setRulesByGuideline(Object.fromEntries(entries));
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to load Brand Intelligence Archive.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadArchive();
  }, [loadArchive]);

  const handleAddGlossary = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTerm.trim()) return;
    try {
      await glossaryApi.create({
        term: newTerm.trim(),
        status: newTermStatus,
        preferredTerm: newPreferred.trim() || undefined,
      });
      setNewTerm('');
      setNewPreferred('');
      toast('Terminology entry stored in backend glossary.');
      void loadArchive();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to create glossary entry.');
    }
  };

  const handleAddClaim = async (e: FormEvent) => {
    e.preventDefault();
    if (!newClaimCode.trim() || !newClaimStatement.trim()) return;
    try {
      await claimsApi.create({
        claimCode: newClaimCode.trim(),
        statement: newClaimStatement.trim(),
        isRegulated: newClaimRegulated,
      });
      setNewClaimCode('');
      setNewClaimStatement('');
      setNewClaimRegulated(false);
      toast('Approved claim registered in backend Claim Registry.');
      void loadArchive();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to register claim.');
    }
  };

  const q = search.trim().toLowerCase();
  const approvedTerms = glossary.filter((g) => g.status === 'approved' && (!q || g.term.toLowerCase().includes(q)));
  const prohibitedTerms = glossary.filter((g) => g.status === 'prohibited' && (!q || g.term.toLowerCase().includes(q)));
  const staleIds = new Set(staleClaims.map((s) => s.id));
  const activeClaims = claims.filter((c) => !staleIds.has(c.id) && (!q || c.claim_code.toLowerCase().includes(q) || c.statement.toLowerCase().includes(q)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <GlassCard style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {(
            [
              ['guidelines', `Guidelines (${guidelines.length})`],
              ['glossary', `Approved & Prohibited Lexicon (${glossary.length})`],
              ['claims', `Claims (${claims.length}${staleClaims.length ? ` · ${staleClaims.length} stale` : ''})`],
              ['assets', `Visual Assets (${assets.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`btn ${tab === id ? 'btn-primary' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px', flex: 1, maxWidth: '330px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-muted)' }} />
            <input
              className="liquid-glass-inset"
              style={{ width: '100%', padding: '8px 10px 8px 30px' }}
              placeholder="Filter brand intelligence..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="button" className="btn" onClick={() => void loadArchive()} disabled={loading}>
            <RefreshCw size={14} />
          </button>
        </div>
      </GlassCard>

      {loading ? (
        <LoadingSkeleton rows={4} height={78} />
      ) : tab === 'guidelines' ? (
        guidelines.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={28} />}
            title="No brand guidelines stored yet"
            description="Official policies and structured rules created via POST /api/v1/guidelines appear here."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {guidelines
              .filter((g) => !q || g.title.toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q))
              .map((g) => (
                <GlassCard key={g.id} variant="elevated">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <h3 className="font-editorial" style={{ margin: 0, fontSize: '1.55rem' }}>
                      {g.title}
                    </h3>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <span className="badge badge-indigo font-mono">v{g.version}</span>
                      <span className={`badge ${g.is_active ? 'badge-emerald' : 'badge-amber'}`}>
                        {g.is_active ? 'Active Policy' : 'Archived'}
                      </span>
                    </div>
                  </div>
                  {g.description && (
                    <p style={{ margin: '0 0 14px', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                      {g.description}
                    </p>
                  )}
                  <div className="grid-2">
                    {(rulesByGuideline[g.id] || []).map((rule) => (
                      <div key={rule.id} className="liquid-glass-subtle" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                          <span className="font-mono" style={{ color: 'var(--sky)', fontSize: '0.74rem' }}>
                            {rule.rule_code} · {rule.category}
                          </span>
                          <SeverityBadge severity={rule.severity} />
                        </div>
                        <strong style={{ fontSize: '0.88rem' }}>{rule.title}</strong>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          {rule.description}
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              ))}
          </div>
        )
      ) : tab === 'glossary' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {isAdmin && (
            <GlassCard>
              <form onSubmit={handleAddGlossary} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  className="liquid-glass-inset"
                  style={{ padding: '9px 12px', flex: 1, minWidth: '160px' }}
                  placeholder="Term (e.g. hack-proof)"
                  value={newTerm}
                  onChange={(e) => setNewTerm(e.target.value)}
                  required
                />
                <select
                  className="liquid-glass-inset"
                  style={{ padding: '9px 12px' }}
                  value={newTermStatus}
                  onChange={(e) => setNewTermStatus(e.target.value as 'prohibited' | 'approved')}
                >
                  <option value="prohibited">Prohibited</option>
                  <option value="approved">Approved</option>
                </select>
                <input
                  className="liquid-glass-inset"
                  style={{ padding: '9px 12px', flex: 1, minWidth: '160px' }}
                  placeholder="Preferred replacement"
                  value={newPreferred}
                  onChange={(e) => setNewPreferred(e.target.value)}
                />
                <button type="submit" className="btn btn-primary">
                  <Plus size={14} /> Add Lexicon Term
                </button>
              </form>
            </GlassCard>
          )}

          {/* Distinct Two-Column Approved vs Prohibited Lexicon Layout */}
          <div className="grid-2">
            <GlassCard variant="elevated">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <CheckCircle2 size={17} color="var(--emerald)" />
                <h3 className="font-editorial" style={{ margin: 0, fontSize: '1.45rem' }}>
                  Approved Terminology ({approvedTerms.length})
                </h3>
              </div>
              {approvedTerms.length === 0 ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>No approved terms registered.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {approvedTerms.map((t) => (
                    <div key={t.id} className="liquid-glass-subtle" style={{ padding: '11px 13px', borderLeft: '3px solid var(--emerald)' }}>
                      <div className="font-mono" style={{ fontWeight: 600, color: '#a7f3d0' }}>{t.term}</div>
                      {t.rationale && <div style={{ fontSize: '0.79rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{t.rationale}</div>}
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>

            <GlassCard variant="elevated">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <ShieldAlert size={17} color="var(--coral)" />
                <h3 className="font-editorial" style={{ margin: 0, fontSize: '1.45rem' }}>
                  Prohibited Language ({prohibitedTerms.length})
                </h3>
              </div>
              {prohibitedTerms.length === 0 ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>No prohibited terms registered.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {prohibitedTerms.map((t) => (
                    <div key={t.id} className="liquid-glass-subtle" style={{ padding: '11px 13px', borderLeft: '3px solid var(--coral)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span className="font-mono" style={{ fontWeight: 600, color: '#fda4af' }}>{t.term}</span>
                        {t.preferred_term && (
                          <>
                            <ArrowRight size={13} color="var(--text-muted)" />
                            <span className="font-mono" style={{ color: '#a7f3d0', fontWeight: 600 }}>{t.preferred_term}</span>
                          </>
                        )}
                      </div>
                      {t.rationale && <div style={{ fontSize: '0.79rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{t.rationale}</div>}
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>
        </div>
      ) : tab === 'claims' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {isAdmin && (
            <GlassCard>
              <form onSubmit={handleAddClaim} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  className="liquid-glass-inset font-mono"
                  style={{ padding: '9px 12px', width: '160px' }}
                  placeholder="CLM-SLA-999"
                  value={newClaimCode}
                  onChange={(e) => setNewClaimCode(e.target.value)}
                  required
                />
                <input
                  className="liquid-glass-inset"
                  style={{ padding: '9px 12px', flex: 1, minWidth: '220px' }}
                  placeholder="Verified factual statement..."
                  value={newClaimStatement}
                  onChange={(e) => setNewClaimStatement(e.target.value)}
                  required
                />
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={newClaimRegulated} onChange={(e) => setNewClaimRegulated(e.target.checked)} />
                  Regulated
                </label>
                <button type="submit" className="btn btn-primary">
                  <Plus size={14} /> Register Claim
                </button>
              </form>
            </GlassCard>
          )}

          {staleClaims.length > 0 && (
            <GlassCard variant="elevated" style={{ borderColor: 'rgba(244,63,94,0.45)', background: 'rgba(244,63,94,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fda4af', fontWeight: 700, marginBottom: '10px' }}>
                <AlertTriangle size={17} />
                Stale / Expired Claims Requiring Governance Renewal ({staleClaims.length})
              </div>
              <div className="grid-2">
                {staleClaims.map((c) => (
                  <div key={c.id} className="liquid-glass-subtle" style={{ padding: '12px', borderColor: 'rgba(244,63,94,0.35)' }}>
                    <div className="font-mono" style={{ fontSize: '0.75rem', color: '#fda4af' }}>
                      {c.claim_code} · Expired {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : ''}
                    </div>
                    <div style={{ fontSize: '0.84rem', marginTop: '4px' }}>{c.statement}</div>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {activeClaims.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck size={28} />}
              title="No active claims in Claim Registry"
              description="Approved factual statements and benchmarks registered via POST /api/v1/claims appear here."
            />
          ) : (
            <div className="grid-2">
              {activeClaims.map((c) => (
                <GlassCard key={c.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span className="font-mono" style={{ color: 'var(--sky)', fontSize: '0.78rem', fontWeight: 600 }}>
                      {c.claim_code}
                    </span>
                    <span className={`badge ${c.is_regulated ? 'badge-amber' : 'badge-emerald'}`}>
                      {c.is_regulated ? 'Regulated' : 'Approved'}
                    </span>
                  </div>
                  <div className="font-manuscript" style={{ fontSize: '0.95rem', marginBottom: '8px' }}>
                    {c.statement}
                  </div>
                  <div className="font-mono" style={{ fontSize: '0.71rem', color: 'var(--text-muted)' }}>
                    Expires: {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : 'No expiry date'}
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      ) : assets.length === 0 ? (
        <EmptyState
          icon={<Palette size={28} />}
          title="No visual brand assets registered"
          description="Approved logos, color palettes, typography specs, and templates registered via POST /api/v1/assets appear here."
        />
      ) : (
        <div className="grid-3">
          {assets
            .filter((a) => !q || a.name.toLowerCase().includes(q))
            .map((asset) => (
              <GlassCard key={asset.id} variant="elevated">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong>{asset.name}</strong>
                  <span className="badge badge-indigo">{asset.asset_type}</span>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {asset.description || 'Approved brand visual asset.'}
                </div>
                {asset.storage_key && (
                  <div className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '10px', wordBreak: 'break-all' }}>
                    {asset.storage_key}
                  </div>
                )}
              </GlassCard>
            ))}
        </div>
      )}
    </div>
  );
}
