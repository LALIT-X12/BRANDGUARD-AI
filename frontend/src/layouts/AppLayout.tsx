import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  BookOpen,
  CheckSquare,
  ChevronRight,
  FileDiff,
  FileText,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Shield,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { AmbientBackdrop } from '../components/AmbientBackdrop';
import { CommandPalette } from '../components/CommandPalette';
import { Toast } from '../components/UI';
import { useApp } from '../contexts/AppContext';
import { useStudio } from '../contexts/StudioContext';
import { DEMO_MODE, healthApi, type BackendHealth } from '../services/api';

const NAV_ITEMS = [
  { num: '01', label: 'Command Centre', path: '/command-centre', icon: LayoutDashboard },
  { num: '02', label: 'Review Studio', path: '/review-studio', icon: FileText },
  { num: '03', label: 'Before / After Diff', path: '/diff', icon: FileDiff },
  { num: '04', label: 'Diagnostic Ledger', path: '/diagnostics', icon: ListChecks },
  { num: '05', label: 'Brand Archive', path: '/archive', icon: BookOpen },
  { num: '06', label: 'Insights & Ambiguity', path: '/insights', icon: Activity },
  { num: '07', label: 'Approval Queue', path: '/approvals', icon: CheckSquare },
  { num: '08', label: 'Audit History', path: '/audit-logs', icon: History },
  { num: 'AI', label: 'AI Intelligence Studio', path: '/ai-studio', icon: Sparkles },
] as const;

const ADMIN_ITEMS = [
  { num: 'USR', label: 'Users', path: '/users', icon: Users },
  { num: 'CFG', label: 'Settings', path: '/settings', icon: Settings },
] as const;

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [health, setHealth] = useState<BackendHealth>({ status: 'checking' });

  const { user, logout, notice, clearNotice, toast, submissions } = useApp();
  const { roleView, setRoleView } = useStudio();
  const loc = useLocation();
  const navigate = useNavigate();

  const isCuratorCapable =
    user?.role === 'Reviewer' || user?.role === 'Brand Admin' || user?.role === 'Tenant Admin';

  const pendingCount = submissions.filter(
    (s) => s.status !== 'Approved' && s.status !== 'Rejected',
  ).length;

  useEffect(() => {
    void healthApi.ready().then(setHealth);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const currentItem =
    [...NAV_ITEMS, ...ADMIN_ITEMS].find((n) => loc.pathname.startsWith(n.path)) || NAV_ITEMS[0];

  const handlePersonaChange = (next: 'creator' | 'curator') => {
    if (next === 'curator' && !isCuratorCapable) {
      toast('Curator view requires Reviewer, Brand Manager, Legal Reviewer, or Brand Admin role.');
      return;
    }
    setRoleView(next);
    navigate(next === 'curator' ? '/approvals' : '/review-studio');
  };

  const healthColor =
    health.status === 'ok'
      ? 'var(--emerald)'
      : health.status === 'degraded'
        ? 'var(--amber)'
        : 'var(--coral)';

  return (
    <>
      <AmbientBackdrop />
      <div className="app-shell">
        <aside
          className={`sidebar liquid-glass-floating ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'open' : ''}`}
          aria-label="Primary navigation"
        >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            width: '100%',
            padding: '0 2px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, rgba(59,130,246,0.38), rgba(139,92,246,0.24))',
                border: '1px solid rgba(255,255,255,0.22)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Shield size={17} color="#dbeafe" />
            </div>
            {!collapsed && (
              <div>
                <div className="font-editorial" style={{ fontSize: '1.36rem', lineHeight: 1 }}>
                  BrandGuard AI
                </div>
                <div className="font-mono" style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                  GOVERNANCE SUITE
                </div>
              </div>
            )}
          </div>

          {!collapsed && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '6px' }}
              onClick={() => setCollapsed(true)}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose size={15} color="var(--text-muted)" />
            </button>
          )}

          <button
            type="button"
            className="btn mobile-menu-btn"
            style={{ padding: '6px' }}
            onClick={() => setMobileOpen(false)}
            aria-label="Close mobile menu"
          >
            <X size={16} />
          </button>
        </div>

        {collapsed && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: '6px' }}
            onClick={() => setCollapsed(false)}
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen size={15} color="var(--text-muted)" />
          </button>
        )}

        {!collapsed && (
          <div className="liquid-glass-subtle" style={{ padding: '7px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <button
              type="button"
              className={`btn ${roleView === 'creator' ? 'btn-primary' : ''}`}
              style={{ padding: '6px 8px', fontSize: '0.74rem' }}
              onClick={() => handlePersonaChange('creator')}
            >
              Creator
            </button>
            <button
              type="button"
              className={`btn ${roleView === 'curator' ? 'btn-primary' : ''}`}
              style={{ padding: '6px 8px', fontSize: '0.74rem' }}
              onClick={() => handlePersonaChange('curator')}
              title={isCuratorCapable ? 'Curator workspace' : 'Requires Reviewer/Admin role'}
            >
              Curator
            </button>
          </div>
        )}

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, width: '100%' }}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                title={item.label}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={16} style={{ flexShrink: 0 }} />
                {!collapsed && (
                  <>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    <span className="nav-num">{item.num}</span>
                  </>
                )}
              </NavLink>
            );
          })}

          {!collapsed && (
            <div
              className="font-mono"
              style={{
                fontSize: '0.62rem',
                color: 'var(--text-muted)',
                padding: '10px 10px 4px',
                borderTop: '1px solid rgba(255,255,255,0.07)',
                marginTop: '6px',
              }}
            >
              ADMINISTRATION
            </div>
          )}
          {ADMIN_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                title={item.label}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={16} style={{ flexShrink: 0 }} />
                {!collapsed && (
                  <>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    <span className="nav-num">{item.num}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div
          className="liquid-glass-subtle"
          style={{
            padding: collapsed ? '8px' : '11px',
            width: '100%',
            fontSize: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            alignItems: collapsed ? 'center' : 'stretch',
          }}
        >
          {!collapsed && (
            <>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {user?.name || 'Workspace User'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <span className="badge badge-indigo">{user?.role || 'Creator'}</span>
                <span className="font-mono" style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                  {user?.tenantName || 'Tenant'}
                </span>
              </div>
            </>
          )}
          <button
            type="button"
            className="btn"
            title="Sign out"
            style={{ width: '100%', padding: '7px' }}
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            <LogOut size={14} />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <button
          type="button"
          className="sidebar-scrim"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation overlay"
        />
      )}

      <div className="main-viewport">
        <header className="topbar liquid-glass-floating">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              className="btn mobile-menu-btn"
              style={{ padding: '7px' }}
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
            <div>
              <div
                className="font-mono"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.68rem',
                  color: 'var(--text-muted)',
                }}
              >
                <span>BrandGuard AI</span>
                <ChevronRight size={12} />
                <span style={{ color: 'var(--accent-blue)' }}>{currentItem.num}</span>
              </div>
              <div className="font-editorial" style={{ fontSize: '1.5rem', lineHeight: 1.1 }}>
                {currentItem.label}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {DEMO_MODE && <span className="badge badge-amber">DEMO MODE</span>}

            <button
              type="button"
              className="liquid-glass-inset"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 12px',
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
              onClick={() => setPaletteOpen(true)}
            >
              <Search size={13} color="var(--accent-blue)" />
              <span>Command Palette</span>
              <kbd className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                ⌘K
              </kbd>
            </button>

            <div
              className="liquid-glass-subtle font-mono"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '6px 10px', fontSize: '0.7rem' }}
              title="FastAPI /health/ready status"
            >
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: healthColor }} />
              <span>API: {health.status}</span>
            </div>

            <button
              type="button"
              className="btn"
              style={{ padding: '7px 10px', position: 'relative' }}
              onClick={() => navigate('/approvals')}
              title="Pending approvals"
              aria-label="Pending approvals"
            >
              <Bell size={15} />
              {pendingCount > 0 && (
                <span className="badge badge-amber font-mono" style={{ padding: '1px 6px', fontSize: '0.66rem' }}>
                  {pendingCount}
                </span>
              )}
            </button>
          </div>
        </header>

        <main style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '28px' }}>
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Toast message={notice} onClose={clearNotice} />
    </div>
    </>
  );
}
