import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Search, X } from 'lucide-react';

export interface CommandItem {
  id: string;
  label: string;
  section: string;
  hint?: string;
  path: string;
}

const COMMANDS: CommandItem[] = [
  { id: 'cmd-01', label: '01 — Command Centre', section: 'Workspaces', hint: 'Brand integrity overview', path: '/command-centre' },
  { id: 'cmd-02', label: '02 — Review Studio', section: 'Workspaces', hint: 'Draft, upload & audit content', path: '/review-studio' },
  { id: 'cmd-03', label: '03 — Before / After Diff', section: 'Workspaces', hint: 'Word-level diff comparison', path: '/diff' },
  { id: 'cmd-04', label: '04 — Diagnostic Ledger', section: 'Workspaces', hint: 'Filter & inspect compliance issues', path: '/diagnostics' },
  { id: 'cmd-05', label: '05 — Brand Intelligence Archive', section: 'Workspaces', hint: 'Guidelines, glossary, claims & assets', path: '/archive' },
  { id: 'cmd-06', label: '06 — Insights & Ambiguity', section: 'Workspaces', hint: 'Channel heatmap & override rates', path: '/insights' },
  { id: 'cmd-07', label: '07 — Approval Queue', section: 'Workspaces', hint: 'Curator human clearance', path: '/approvals' },
  { id: 'cmd-08', label: '08 — Audit History Archive', section: 'Workspaces', hint: 'Immutable governance log', path: '/audit-logs' },
  { id: 'cmd-ai', label: 'AI Intelligence Studio', section: 'AI Suite', hint: 'Auditor, Fix Assistant, Claim Verifier', path: '/ai-studio' },
  { id: 'cmd-usr', label: 'User Management', section: 'Administration', hint: 'RBAC role provisioning', path: '/users' },
  { id: 'cmd-cfg', label: 'Workspace Settings', section: 'Administration', hint: 'Profile & tenant settings', path: '/settings' },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.section.toLowerCase().includes(q) ||
        (c.hint || '').toLowerCase().includes(q),
    );
  }, [query]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Command palette" onClick={onClose}>
      <div
        className="liquid-glass-floating"
        style={{ width: '100%', maxWidth: '560px', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '14px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <Search size={16} color="var(--accent-blue)" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to workspace or governance view..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '0.9rem',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filtered[0]) {
                navigate(filtered[0].path);
                onClose();
              }
            }}
          />
          <button type="button" className="btn btn-ghost" style={{ padding: '4px' }} onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <div style={{ maxHeight: '360px', overflowY: 'auto', padding: '10px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              No matching workspace commands.
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                className="nav-item"
                style={{ justifyContent: 'space-between', padding: '10px 12px' }}
                onClick={() => {
                  navigate(item.path);
                  onClose();
                }}
              >
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</div>
                  <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                    {item.section} {item.hint ? `· ${item.hint}` : ''}
                  </div>
                </div>
                <ArrowRight size={14} color="var(--text-muted)" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
