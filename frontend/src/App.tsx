import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { ErrorBoundary } from './components/GlassUI';
import { AppProvider, useApp } from './contexts/AppContext';
import { StudioProvider } from './contexts/StudioContext';
import AppLayout from './layouts/AppLayout';
import AIStudio from './pages/AIStudio';
import ApprovalQueue from './pages/ApprovalQueue';
import AuditHistory from './pages/AuditHistory';
import Auth from './pages/Auth';
import BrandArchive from './pages/BrandArchive';
import CommandCentre from './pages/CommandCentre';
import DiagnosticLedger from './pages/DiagnosticLedger';
import DiffWorkspace from './pages/DiffWorkspace';
import InsightsAmbiguity from './pages/InsightsAmbiguity';
import ReviewStudio from './pages/ReviewStudio';
import { Settings, Users } from './pages/Pages';
import { DEMO_MODE, tokenStore } from './services/api';

import './styles/global.css';

function Guard({ children }: { children: ReactNode }) {
  const { user } = useApp();
  if (!DEMO_MODE && (!user || !tokenStore.get())) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function Router() {
  return (
    <Routes>
      {/* Existing authentication routes preserved */}
      <Route path="/login" element={<Auth mode="login" />} />
      <Route path="/register" element={<Auth mode="register" />} />
      <Route path="/forgot-password" element={<Auth mode="forgot" />} />
      <Route path="/reset-password" element={<Auth mode="reset" />} />

      {/* Main Liquid Glass Governance Platform */}
      <Route
        element={
          <Guard>
            <ErrorBoundary>
              <AppLayout />
            </ErrorBoundary>
          </Guard>
        }
      >
        <Route path="/" element={<Navigate to="/command-centre" replace />} />

        {/* 8 Core Workspaces + Dedicated AI Studio */}
        <Route path="/command-centre" element={<CommandCentre />} />
        <Route path="/review-studio" element={<ReviewStudio />} />
        <Route path="/diff" element={<DiffWorkspace />} />
        <Route path="/diagnostics" element={<DiagnosticLedger />} />
        <Route path="/archive" element={<BrandArchive />} />
        <Route path="/insights" element={<InsightsAmbiguity />} />
        <Route path="/approvals" element={<ApprovalQueue />} />
        <Route path="/audit-logs" element={<AuditHistory />} />
        <Route path="/ai-studio" element={<AIStudio />} />

        {/* Preserved legacy routes & compatible redirects */}
        <Route path="/overview" element={<Navigate to="/command-centre" replace />} />
        <Route path="/dashboard" element={<Navigate to="/command-centre" replace />} />
        <Route path="/submissions" element={<Navigate to="/review-studio" replace />} />
        <Route path="/submissions/new" element={<Navigate to="/review-studio" replace />} />
        <Route path="/reviews" element={<Navigate to="/review-studio" replace />} />
        <Route path="/issues" element={<Navigate to="/diagnostics" replace />} />
        <Route path="/guidelines" element={<Navigate to="/archive" replace />} />
        <Route path="/claims" element={<Navigate to="/archive" replace />} />
        <Route path="/glossary" element={<Navigate to="/archive" replace />} />
        <Route path="/analytics" element={<Navigate to="/insights" replace />} />
        <Route path="/users" element={<Users />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/command-centre" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AppProvider>
      <StudioProvider>
        <BrowserRouter>
          <Router />
        </BrowserRouter>
      </StudioProvider>
    </AppProvider>
  );
}
