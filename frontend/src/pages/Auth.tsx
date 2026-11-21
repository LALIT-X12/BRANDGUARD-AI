import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Shield, ShieldCheck } from 'lucide-react';
import { AmbientBackdrop } from '../components/AmbientBackdrop';
import { useApp } from '../contexts/AppContext';
import { DEMO_MODE, authAdapter } from '../services/api';

export default function Auth({
  mode,
}: {
  mode: 'login' | 'register' | 'forgot' | 'reset';
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState(localStorage.getItem('bg_tenant_slug') || '');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const { loginDemo, loginLive } = useApp();
  const nav = useNavigate();

  const title = {
    login: 'Sign in to BrandGuard',
    register: 'Create your governance workspace',
    forgot: 'Password recovery unavailable',
    reset: 'Password reset unavailable',
  }[mode];

  const updateSlug = (value: string) => {
    setTenantSlug(value.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-'));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.includes('@')) {
      setError('Enter a valid work email address.');
      return;
    }

    if ((mode === 'login' || mode === 'register') && password.length < 8) {
      setError('Password must contain at least 8 characters.');
      return;
    }

    const cleanSlug = tenantSlug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '');

    if (mode === 'register' && !DEMO_MODE) {
      if (!name.trim() || !tenantName.trim() || cleanSlug.length < 2) {
        setError('Complete all workspace and account fields (slug must be at least 2 characters).');
        return;
      }
    }

    if (mode === 'login' && !DEMO_MODE && !cleanSlug) {
      setError('Enter your workspace slug.');
      return;
    }

    setBusy(true);
    try {
      if ((mode === 'login' || mode === 'register') && DEMO_MODE) {
        loginDemo(email);
        nav('/command-centre', { replace: true });
        return;
      }

      if (mode === 'register') {
        const result = await authAdapter.register({
          name: name.trim(),
          email: email.trim(),
          password,
          tenantName: tenantName.trim(),
          tenantSlug: cleanSlug,
        });
        localStorage.setItem('bg_tenant_slug', cleanSlug);
        loginLive(result.user);
        nav('/command-centre', { replace: true });
        return;
      }

      if (mode === 'login') {
        const result = await authAdapter.login(email.trim(), password, cleanSlug, cleanSlug);
        localStorage.setItem('bg_tenant_slug', cleanSlug);
        loginLive(result.user);
        nav('/command-centre', { replace: true });
        return;
      }

      setError('Password recovery endpoints are not implemented in the FastAPI backend yet.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AmbientBackdrop />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
        }}
      >
        <div
          className="liquid-glass-floating grid-2"
          style={{ width: '100%', maxWidth: '980px', overflow: 'hidden', padding: 0 }}
        >
        <div
          style={{
            padding: '42px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            background:
              'linear-gradient(155deg, rgba(255,255,255,0.065), rgba(255,255,255,0.015))',
            borderRight: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '11px',
                background: 'linear-gradient(135deg, rgba(129,140,248,0.38), rgba(56,189,248,0.22))',
                border: '1px solid rgba(255,255,255,0.25)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Shield size={19} color="#c7d2fe" />
            </div>
            <div>
              <div className="font-editorial" style={{ fontSize: '1.5rem', lineHeight: 1 }}>
                BrandGuard AI
              </div>
              <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                COGNITIVE VERIFICATION PLATFORM
              </div>
            </div>
          </div>

          <div style={{ margin: '40px 0' }}>
            <div
              className="liquid-glass"
              style={{
                width: '68px',
                height: '68px',
                display: 'grid',
                placeItems: 'center',
                marginBottom: '20px',
              }}
            >
              <ShieldCheck size={34} color="var(--emerald)" />
            </div>
            <div className="eyebrow">PRE-PUBLICATION GOVERNANCE</div>
            <h2 className="font-editorial" style={{ fontSize: '2.6rem', lineHeight: 1.08, margin: '8px 0 12px' }}>
              Every claim grounded. Every approval human-verified.
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              Audit marketing copy against brand guidelines, approved terminology, and verifiable claims — with tenant-isolated RBAC and append-only audit logs.
            </p>
          </div>

          <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            JWT · RBAC · PostgreSQL + pgvector · Claude AI Orchestration
          </div>
        </div>

        <div style={{ padding: '42px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="eyebrow">WORKSPACE AUTHENTICATION</div>
          <h1 className="font-editorial" style={{ fontSize: '2.1rem', margin: '6px 0 8px' }}>
            {title}
          </h1>
          <p style={{ margin: '0 0 18px', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
            {mode === 'login'
              ? 'Authenticate with your FastAPI tenant credentials.'
              : mode === 'register'
                ? 'Provision a new tenant workspace and Creator account.'
                : 'Backend password recovery endpoints are not yet exposed.'}
          </p>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {mode === 'register' && (
              <>
                <label className="field" style={{ marginTop: 0 }}>
                  <span>Full name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Nair" required />
                </label>
                {!DEMO_MODE && (
                  <label className="field" style={{ marginTop: 0 }}>
                    <span>Workspace name</span>
                    <input
                      value={tenantName}
                      onChange={(e) => {
                        setTenantName(e.target.value);
                        updateSlug(e.target.value);
                      }}
                      placeholder="Acme Global"
                      required
                    />
                  </label>
                )}
              </>
            )}

            {(mode === 'login' || mode === 'register') && !DEMO_MODE && (
              <label className="field" style={{ marginTop: 0 }}>
                <span>Workspace slug</span>
                <input
                  className="font-mono"
                  value={tenantSlug}
                  onChange={(e) => updateSlug(e.target.value)}
                  placeholder="acme-global"
                  required
                />
              </label>
            )}

            <label className="field" style={{ marginTop: 0 }}>
              <span>Work email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                required
              />
            </label>

            {(mode === 'login' || mode === 'register' || mode === 'reset') && (
              <label className="field" style={{ marginTop: 0 }}>
                <span>Password</span>
                <div style={{ position: 'relative' }}>
                  <input
                    type={show ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    minLength={8}
                    required
                    style={{ paddingRight: '40px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    aria-label="Toggle password visibility"
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
            )}

            {error && (
              <div
                className="liquid-glass-subtle"
                style={{
                  padding: '10px 12px',
                  borderColor: 'rgba(244,63,94,0.45)',
                  color: '#fda4af',
                  fontSize: '0.8rem',
                }}
              >
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%', marginTop: '6px' }}>
              {busy ? 'Authenticating...' : mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Continue'}
              <ArrowRight size={15} />
            </button>
          </form>

          {DEMO_MODE && mode === 'login' && (
            <div className="liquid-glass-subtle" style={{ padding: '10px 12px', marginTop: '14px', fontSize: '0.78rem', color: '#fcd34d' }}>
              Demo mode is enabled (`VITE_DEMO_MODE=true`). Sign in with any valid email and 8+ character password.
            </div>
          )}

          <div style={{ marginTop: '18px', fontSize: '0.82rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
            {mode === 'login' ? (
              <>
                New to BrandGuard?{' '}
                <Link to="/register" style={{ color: 'var(--sky)', fontWeight: 600 }}>
                  Create workspace
                </Link>
              </>
            ) : (
              <Link to="/login" style={{ color: 'var(--sky)', fontWeight: 600 }}>
                Back to sign in
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
