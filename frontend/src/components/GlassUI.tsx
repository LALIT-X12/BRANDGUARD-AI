import React, { type CSSProperties, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';

export function GlassCard({
  children,
  variant = 'default',
  style = {},
  className = '',
}: {
  children: ReactNode;
  variant?: 'default' | 'elevated' | 'subtle' | 'floating';
  style?: CSSProperties;
  className?: string;
}) {
  const cls =
    variant === 'floating'
      ? 'liquid-glass-floating'
      : variant === 'elevated'
        ? 'liquid-glass-elevated'
        : variant === 'subtle'
          ? 'liquid-glass-subtle'
          : 'liquid-glass';
  return (
    <section className={`${cls} ${className}`} style={{ padding: '20px', ...style }}>
      {children}
    </section>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const s = severity.toLowerCase();
  if (s === 'critical') {
    return (
      <span className="badge badge-coral">
        <ShieldAlert size={12} /> Critical
      </span>
    );
  }
  if (s === 'high') {
    return (
      <span className="badge badge-coral">
        <AlertCircle size={12} /> High
      </span>
    );
  }
  if (s === 'medium' || s === 'warning') {
    return (
      <span className="badge badge-amber">
        <AlertTriangle size={12} /> Warning
      </span>
    );
  }
  return (
    <span className="badge badge-sky">
      <Info size={12} /> Info
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (['approved', 'fixed', 'validated', 'completed', 'resolved', 'upheld', 'adopted'].includes(s)) {
    return (
      <span className="badge badge-emerald">
        <CheckCircle2 size={12} /> {s.replace(/_/g, ' ')}
      </span>
    );
  }
  if (['rejected', 'failed', 'failed_human_fallback'].includes(s)) {
    return <span className="badge badge-coral">{s.replace(/_/g, ' ')}</span>;
  }
  if (['disputed', 'changes_requested', 'pending', 'in_review', 'running', 'dismissed'].includes(s)) {
    return <span className="badge badge-amber">{s.replace(/_/g, ' ')}</span>;
  }
  return <span className="badge badge-indigo">{s.replace(/_/g, ' ')}</span>;
}

export function LoadingSkeleton({ rows = 3, height = 56 }: { rows?: number; height?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }} aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: `${height}px`, width: '100%' }} />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="liquid-glass-subtle"
      style={{
        padding: '34px 22px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      {icon && <div style={{ color: 'var(--indigo)', opacity: 0.9 }}>{icon}</div>}
      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{title}</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', maxWidth: '460px' }}>
        {description}
      </div>
      {action && <div style={{ marginTop: '6px' }}>{action}</div>}
    </div>
  );
}

export function UnavailableNotice({
  title,
  reason,
  endpointNote,
}: {
  title: string;
  reason: string;
  endpointNote?: string;
}) {
  return (
    <div
      className="liquid-glass-subtle"
      style={{
        padding: '15px 18px',
        borderColor: 'rgba(245, 158, 11, 0.34)',
        background: 'rgba(245, 158, 11, 0.055)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: 600,
          fontSize: '0.88rem',
          color: '#fcd34d',
        }}
      >
        <AlertTriangle size={16} />
        <span>{title} — Backend Capability Unavailable</span>
      </div>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {reason}
      </div>
      {endpointNote && (
        <div className="font-mono" style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
          {endpointNote}
        </div>
      )}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: 'primary' | 'emerald' | 'coral' | 'amber';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  const btnCls =
    tone === 'emerald'
      ? 'btn btn-emerald'
      : tone === 'coral'
        ? 'btn btn-coral'
        : tone === 'amber'
          ? 'btn btn-amber'
          : 'btn btn-primary';

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="liquid-glass-floating" style={{ width: '100%', maxWidth: '440px', padding: '24px' }}>
        <h3 id="confirm-title" className="font-editorial" style={{ margin: '0 0 8px', fontSize: '1.55rem' }}>
          {title}
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          {message}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={btnCls} onClick={onConfirm} disabled={busy}>
            {busy ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message || 'Unexpected rendering error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <GlassCard variant="elevated" style={{ maxWidth: '540px', margin: '32px auto' }}>
          <h2 className="font-editorial" style={{ marginTop: 0, fontSize: '1.75rem' }}>
            Workspace Recovery
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>{this.state.message}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => this.setState({ hasError: false, message: '' })}
          >
            Reload Workspace
          </button>
        </GlassCard>
      );
    }
    return this.props.children;
  }
}
