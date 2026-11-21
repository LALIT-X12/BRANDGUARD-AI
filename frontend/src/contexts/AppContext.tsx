import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { User, Submission, Status } from '../types';
import {
  DEMO_MODE,
  authAdapter,
  submissionsApi,
  tokenStore,
} from '../services/api';
import { demoSubmissions } from '../services/demo';

interface AppState {
  user: User | null;
  loginDemo: (email: string, role?: User['role']) => void;
  loginLive: (user: User) => void;
  logout: () => void;
  submissions: Submission[];
  submissionsLoading: boolean;
  submissionsError: string;
  refreshSubmissions: () => Promise<void>;
  addSubmission: (s: Submission) => void;
  updateStatus: (id: string, status: Status) => void;
  toast: (message: string) => void;
  notice: string;
  clearNotice: () => void;
}

const C = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('bg_user') || 'null');
    } catch {
      return null;
    }
  });

  const [submissions, setSubmissions] = useState<Submission[]>(() => {
    if (!DEMO_MODE) return [];
    try {
      return (
        JSON.parse(localStorage.getItem('bg_submissions') || 'null') ||
        demoSubmissions
      );
    } catch {
      return demoSubmissions;
    }
  });
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionsError, setSubmissionsError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshSubmissions = useCallback(async () => {
    if (DEMO_MODE || !user || !tokenStore.get()) return;
    setSubmissionsLoading(true);
    setSubmissionsError('');
    try {
      const items = await submissionsApi.list();
      setSubmissions(items);
    } catch (err) {
      setSubmissionsError(
        err instanceof Error ? err.message : 'Unable to load submissions.',
      );
    } finally {
      setSubmissionsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!DEMO_MODE && user && tokenStore.get()) {
      void refreshSubmissions();
    } else if (!user) {
      setSubmissions([]);
    }
  }, [user, refreshSubmissions]);

  useEffect(() => {
    if (DEMO_MODE || !user?.id || !tokenStore.get()) return;
    let active = true;
    void authAdapter
      .me()
      .then((me) => {
        if (!active) return;
        setUser((prev) => {
          if (!prev || prev.role === me.role) return prev;
          const next = { ...prev, role: me.role };
          localStorage.setItem('bg_user', JSON.stringify(next));
          return next;
        });
      })
      .catch(() => {
        // Keep cached profile if transient network check fails.
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  const loginDemo = (email: string, role: User['role'] = 'Creator') => {
    if (!DEMO_MODE) {
      throw new Error('Demo authentication is disabled.');
    }

    const next: User = {
      id: 'demo-user',
      name: email
        .split('@')[0]
        .replace(/[._-]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      email,
      role,
      tenantName: 'Demo workspace',
    };

    setUser(next);
    localStorage.setItem('bg_user', JSON.stringify(next));
  };

  const loginLive = (next: User) => {
    setUser(next);
    localStorage.setItem('bg_user', JSON.stringify(next));
  };

  const logout = () => {
    setUser(null);
    setSubmissions([]);
    localStorage.removeItem('bg_user');

    void authAdapter.logout().catch(() => {
      // Local session is already cleared.
    });
  };

  const addSubmission = (s: Submission) => {
    setSubmissions((old) => {
      const next = [s, ...old];
      if (DEMO_MODE) {
        localStorage.setItem('bg_submissions', JSON.stringify(next));
      }
      return next;
    });
  };

  const updateStatus = (id: string, status: Status) => {
    setSubmissions((old) => {
      const next = old.map((item) =>
        item.id === id ? { ...item, status } : item,
      );
      if (DEMO_MODE) {
        localStorage.setItem('bg_submissions', JSON.stringify(next));
      }
      return next;
    });
  };

  const value = useMemo(
    () => ({
      user,
      loginDemo,
      loginLive,
      logout,
      submissions,
      submissionsLoading,
      submissionsError,
      refreshSubmissions,
      addSubmission,
      updateStatus,
      toast: (message: string) => {
        setNotice(message);
        window.setTimeout(() => setNotice(''), 3200);
      },
      notice,
      clearNotice: () => setNotice(''),
    }),
    [user, submissions, submissionsLoading, submissionsError, refreshSubmissions, notice],
  );

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useApp() {
  const value = useContext(C);

  if (!value) {
    throw new Error('useApp must be used inside AppProvider');
  }

  return value;
}
