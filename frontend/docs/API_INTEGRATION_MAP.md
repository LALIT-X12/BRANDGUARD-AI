# BrandGuard AI — API integration map

## Current discovery status

The existing repository context identifies the FastAPI service under `backend/`, the separate AI integration at the repository root under `app/`, and the configured API prefix `/api/v1`. The backend modules previously identified include authentication, claims, disputes, fixes, glossary, guidelines, issues, reviews, submissions, tenants, users, analytics, approvals, assets, assignments and audit.

**Important:** the source files, router registrations, OpenAPI document and Pydantic request/response schemas were not available to this frontend build environment. Therefore no endpoint paths, HTTP methods, payload fields, token refresh flow, upload form names, pagination parameters or response fields are guessed here. This document is a contract-discovery checklist, not a claim that integration is complete.

## Required contract extraction before enabling live calls

Inspect the running service's `/openapi.json` (if enabled) and source code under `backend/`. Record each router's exact prefix, path, method, dependency/role requirements, request schema, response schema, error format and pagination/filter behavior.

| Frontend capability | Existing backend area to inspect | Contract evidence still required |
|---|---|---|
| Login, registration, reset, refresh, logout | `auth` | Exact paths/methods, credential schema, token response, cookie vs bearer behavior, refresh rotation, expiry and reset flow |
| Tenant context and membership | `tenants`, `users` | Tenant selection/header or claim rules, member list schema, invitation and role mutation permissions |
| Content submission | `submissions` | Create/list/detail routes, required metadata, status enum, idempotency support, pagination/filter schema |
| Asset upload | `assets` | Multipart field names, MIME allowlist, max size, storage flow, signed URL behavior and upload response |
| AI review | `reviews`, AI client/worker modules | Create/retry/detail routes, status enum, polling or event mechanism, result/finding schema and confidence/source fields |
| Fixes and disputes | `fixes`, `disputes` | Suggestion acceptance/validation, dispute creation and resolution payloads |
| Brand guidelines | `guidelines` | CRUD routes, versioning, category schema and tenant scope |
| Issue management | `issues` | Severity/status enums, issue detail, assignment and resolution routes |
| Claims registry | `claims` | Claim schema, evidence references, expiry and verification status enums |
| Glossary | `glossary` | Approved/restricted term schema and search/filter behavior |
| Approval center | `approvals`, `assignments` | Queue filters, reviewer assignment, approve/reject/request-changes payloads and authorization |
| Analytics | `analytics` | Metric names, date range parameters and response shape |
| Audit log | `audit` | Event schema, immutable fields, filters and pagination |

## Frontend integration points

- `src/services/api.ts`: centralized fetch client, base URL, bearer header support and typed error wrapper.
- `src/services/api.ts` `authAdapter`: intentionally disabled until authentication contracts are confirmed.
- `src/types/index.ts`: UI-facing domain types. Map backend Pydantic models into these types in service adapters; do not assume the wire format matches these view models.
- `src/contexts/AppContext.tsx`: UI session and local demo state. Replace demo login with the verified auth adapter and apply the backend's actual refresh/logout strategy.
- `src/pages/Pages.tsx`: page-level UI. Keep data fetching and wire-format mapping in service modules/hooks rather than embedding endpoint paths in components.

## Safe implementation sequence

1. Export and inspect the backend OpenAPI schema and router registration.
2. Verify JWT access/refresh behavior and whether tokens are returned in JSON or secure cookies. Do not store refresh tokens in localStorage. Prefer HttpOnly, Secure, SameSite cookies if that is the backend contract.
3. Create typed DTOs that exactly match Pydantic schemas; add explicit DTO-to-view-model mappers.
4. Implement tenant context and role/permission checks from server-provided claims/permissions. UI hiding is not a security boundary; the backend must enforce authorization.
5. Implement submissions and assets using the backend's accepted upload mechanism and limits.
6. Implement review job creation and the backend-supported status mechanism (polling, SSE, WebSocket or other verified mechanism). Render only findings returned by the server.
7. Wire approval, claims, glossary, guideline, issue, analytics and audit pages one module at a time.
8. Add contract tests against the actual FastAPI service and test tenant isolation, expired sessions, forbidden roles, upload failures and background-worker failures.

## Environment and CORS

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_DEMO_MODE=false
```

Configure backend CORS to allow the exact frontend origin. The frontend must never receive database URLs, AI provider credentials, JWT signing secrets, private object-storage keys or internal service credentials.

## Current status summary

- UI routes, navigation, responsive layout, local demo submission flow and sample visual states: implemented.
- Live API client foundation and environment configuration: implemented.
- Exact FastAPI endpoint/schema integration: pending backend source/OpenAPI inspection.
- Live authentication, live upload, live AI review, live approvals and live analytics: intentionally not represented as connected.
