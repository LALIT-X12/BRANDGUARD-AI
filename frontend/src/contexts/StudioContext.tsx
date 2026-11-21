import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type {
  BackendFix,
  BackendIssue,
  BackendReviewSession,
  BackendSubmission,
} from '../services/api';

export interface ReconciliationEntry {
  id: string;
  timestamp: string;
  action: 'adopted' | 'dismissed' | 'edited';
  ruleRef: string;
  evidence: string;
  validationStatus: string;
}

export interface AISessionRecord {
  id: string;
  timestamp: string;
  module: string;
  summary: string;
  status: 'ok' | 'warning' | 'error';
}

export interface StudioState {
  title: string;
  channel: 'social' | 'blog' | 'press' | 'landing';
  audience: string;
  intent: string;
  sensitivity: 'public' | 'internal' | 'confidential' | 'regulated';
  originalText: string;
  currentText: string;
  submission: BackendSubmission | null;
  reviewSession: BackendReviewSession | null;
  issues: BackendIssue[];
  fixMap: Record<string, BackendFix>;
  ledger: ReconciliationEntry[];
  aiHistory: AISessionRecord[];
}

interface StudioContextValue {
  studio: StudioState;
  setStudio: Dispatch<SetStateAction<StudioState>>;
  roleView: 'creator' | 'curator';
  setRoleView: (next: 'creator' | 'curator') => void;
  pushAIHistory: (entry: Omit<AISessionRecord, 'id' | 'timestamp'>) => void;
}

const initialStudio: StudioState = {
  title: '',
  channel: 'landing',
  audience: 'Enterprise IT & Security Buyers',
  intent: 'Communicate product capabilities transparently without overclaiming',
  sensitivity: 'internal',
  originalText: '',
  currentText: '',
  submission: null,
  reviewSession: null,
  issues: [],
  fixMap: {},
  ledger: [],
  aiHistory: [],
};

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [studio, setStudio] = useState<StudioState>(initialStudio);
  const [roleView, setRoleView] = useState<'creator' | 'curator'>('creator');

  const pushAIHistory = (entry: Omit<AISessionRecord, 'id' | 'timestamp'>) => {
    setStudio((prev) => ({
      ...prev,
      aiHistory: [
        {
          ...entry,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
        },
        ...prev.aiHistory.slice(0, 19),
      ],
    }));
  };

  return (
    <StudioContext.Provider
      value={{ studio, setStudio, roleView, setRoleView, pushAIHistory }}
    >
      {children}
    </StudioContext.Provider>
  );
}

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio must be used inside StudioProvider');
  return ctx;
}
