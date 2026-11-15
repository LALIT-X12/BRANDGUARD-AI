# BrandGuard AI — Frontend

Premium milk-chocolate / ivory skeuomorphic frontend for the existing BrandGuard AI platform.

## Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS with a custom skeuomorphic component system
- React Router
- Recharts and Lucide icons

## Run locally

```bash
cd brandguard-frontend
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`.

For a production build:

```bash
npm run typecheck
npm run build
npm run preview
```

## Demo mode vs live mode

The default is **live mode** (`VITE_DEMO_MODE=false`). In live mode the UI does not seed fake production records, and API-backed actions remain unavailable until the exact backend contracts are mapped in `docs/API_INTEGRATION_MAP.md`.

For a local UI walkthrough only, set `VITE_DEMO_MODE=true`. Demo mode enables a local-only session, sample content, illustrative analytics and local submission/approval interactions stored in browser localStorage. A persistent banner labels these records as demo data. Demo data is never sent to FastAPI.

## Backend boundary

This project is a standalone frontend. It does not include, replace, patch, or migrate the FastAPI backend or the separate AI integration. Configure only the public API origin in `VITE_API_BASE_URL`; never put database credentials, AI provider keys, JWT signing secrets or private storage credentials in Vite variables.

The backend is expected to remain the source of truth for authentication, tenant isolation, permissions, review processing, findings, approvals, claims, glossary, guidelines, analytics and audit events. See `docs/API_INTEGRATION_MAP.md` before connecting live features.

## Routes

- `/login`, `/register`, `/forgot-password`, `/reset-password`
- `/overview`, `/dashboard`
- `/submissions`, `/submissions/new`
- `/reviews`, `/guidelines`, `/issues`, `/claims`, `/glossary`, `/approvals`
- `/analytics`, `/audit-logs`, `/users`, `/settings`

## Notes

- The frontend does not claim that sample AI findings are live AI output.
- Approval controls are demo-only until the real approval contract is wired.
- Upload UI accepts common image, PDF, DOCX, DOC, TXT and Markdown selections for the demo. Actual accepted MIME types, size limits and multipart field names must be confirmed from backend schemas before live upload is enabled.
- CORS must be configured on the backend for the frontend origin (for example `http://localhost:5173`). No backend changes are made by this frontend package.
