import type {
  AuditEvent,
  Claim,
  Finding,
  GlossaryTerm,
  Guideline,
  Role,
  Severity,
  Status,
  Submission,
  User,
} from '../types';

const BASE = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
).replace(/\/$/, '');

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = localStorage.getItem('bg_access_token');

export const tokenStore = {
  get: () => accessToken,
  set: (value: string | null) => {
    accessToken = value;
    if (value) localStorage.setItem('bg_access_token', value);
    else localStorage.removeItem('bg_access_token');
  },
  clear: () => {
    accessToken = null;
    localStorage.removeItem('bg_access_token');
    localStorage.removeItem('bg_refresh_token');
  },
};

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('bg_refresh_token');
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as TokenResponse;
    tokenStore.set(data.access_token);
    if (data.refresh_token) {
      localStorage.setItem('bg_refresh_token', data.refresh_token);
    }
    return true;
  } catch {
    return false;
  }
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
  retryOnAuth = true,
): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let response: Response;

  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiError(
      'Cannot reach the BrandGuard API. Check that the backend is running.',
    );
  }

  if (
    response.status === 401 &&
    retryOnAuth &&
    !path.startsWith('/api/v1/auth/login') &&
    !path.startsWith('/api/v1/auth/register') &&
    !path.startsWith('/api/v1/auth/refresh')
  ) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      return request<T>(path, init, false);
    }
  }

  const payload =
    response.status === 204
      ? null
      : await response.json().catch(() => null);

  if (!response.ok) {
    const detail = payload?.detail;
    const message =
      payload?.error?.message ||
      (typeof detail === 'string' ? detail : detail?.[0]?.msg) ||
      payload?.message ||
      `Request failed (${response.status})`;

    throw new ApiError(message, response.status);
  }

  return payload as T;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
}

interface BackendUser {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  roles?: string[];
}

interface MeResponse {
  user_id: string;
  tenant_id: string;
  roles: string[];
}

interface TenantResponse {
  id: string;
  name: string;
  slug: string;
  is_active?: boolean;
}

export interface BackendSubmission {
  id: string;
  tenant_id: string;
  creator_id: string;
  title: string;
  channel: string;
  audience: string;
  intent: string;
  content_format: string;
  sensitivity_label: string;
  status: string;
  current_version_number: number;
  is_locked: boolean;
  created_at: string;
}

export interface BackendIssue {
  id: string;
  submission_id: string;
  content_version_id: string;
  review_session_id: string;
  category: string;
  severity: string;
  confidence: number;
  evidence: string;
  rule_ref: string;
  source_ref: string | null;
  suggested_fix: string | null;
  checker_type: string;
  status: string;
}

export interface BackendReviewSession {
  id: string;
  tenant_id: string;
  submission_id: string;
  content_version_id: string;
  status: string;
  risk_level: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface BackendGuideline {
  id: string;
  tenant_id: string;
  title: string;
  version: string;
  description: string | null;
  storage_key: string | null;
  is_active: boolean;
}

export interface BackendGuidelineRule {
  id: string;
  guideline_id: string;
  rule_code: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  channel_scope: string | null;
  priority: number;
  is_active: boolean;
}

export interface BackendGlossaryEntry {
  id: string;
  tenant_id: string;
  term: string;
  status: 'approved' | 'prohibited';
  preferred_term: string | null;
  rationale: string | null;
  category: string | null;
  is_case_sensitive: boolean;
}

export interface BackendClaim {
  id: string;
  tenant_id: string;
  claim_code: string;
  statement: string;
  scope: string | null;
  owner_id: string | null;
  expires_at: string | null;
  is_regulated: boolean;
  is_active: boolean;
}

export interface BackendAnalytics {
  most_violated_guidelines: Array<{ rule_ref: string; count: number }>;
  violations_by_channel: Array<{ channel: string; count: number }>;
  dispute_rate: number;
  override_rate: number;
  stale_claims_count: number;
  total_approvals: number;
}

export interface BackendAuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

function mapRole(roles?: string[]): Role {
  const normalized = (roles || []).map((r) => r.toLowerCase());

  if (normalized.some((r) => r.includes('brand_admin'))) return 'Brand Admin';
  if (normalized.some((r) => r.includes('tenant_admin'))) return 'Tenant Admin';
  if (
    normalized.some(
      (r) => r.includes('reviewer') || r.includes('brand_manager'),
    )
  ) {
    return 'Reviewer';
  }

  return 'Creator';
}

function mapSubmissionStatus(raw: string): Status {
  const s = raw.toLowerCase();
  if (s === 'draft') return 'Draft';
  if (s === 'ingested' || s === 'submitted') return 'Submitted';
  if (s === 'queued') return 'Queued';
  if (s === 'processing' || s === 'in_review') return 'Processing';
  if (s === 'completed') return 'Completed';
  if (s === 'changes_requested') return 'Changes Requested';
  if (s === 'approved') return 'Approved';
  if (s === 'rejected') return 'Rejected';
  if (s === 'failed') return 'Failed';
  return 'Submitted';
}

function mapSeverity(raw: string): Severity {
  const s = raw.toLowerCase();
  if (s === 'critical') return 'Critical';
  if (s === 'high') return 'High';
  if (s === 'medium') return 'Medium';
  if (s === 'low') return 'Low';
  return 'Informational';
}

export function toSubmission(row: BackendSubmission): Submission {
  return {
    id: row.id,
    campaign: row.title,
    platform: row.channel,
    category: row.audience,
    filename: `${row.content_format} · v${row.current_version_number}`,
    submittedAt: row.created_at,
    status: mapSubmissionStatus(row.status),
    submittedBy: row.creator_id.slice(0, 8),
    description: row.intent,
  };
}

export function toFinding(row: BackendIssue): Finding {
  return {
    id: row.id,
    title: `${row.category} (${row.rule_ref})`,
    description: row.evidence,
    severity: mapSeverity(row.severity),
    source: row.source_ref || row.rule_ref,
    location: row.status,
    suggestion: row.suggested_fix || undefined,
    confidence: row.confidence,
    kind:
      row.checker_type.toLowerCase().includes('rule')
        ? 'Rule-based'
        : 'AI-assisted',
  };
}

export function toGuideline(row: BackendGuideline): Guideline {
  return {
    id: row.id,
    title: row.title,
    category: `v${row.version}`,
    description: row.description || 'Active brand governance guideline.',
    updatedAt: new Date().toISOString(),
  };
}

export function toGlossary(row: BackendGlossaryEntry): GlossaryTerm {
  return {
    id: row.id,
    term: row.term,
    type: row.status === 'approved' ? 'Approved' : 'Restricted',
    definition: row.rationale || row.category || 'Workspace glossary entry.',
    replacement: row.preferred_term || undefined,
  };
}

export function toClaim(row: BackendClaim): Claim {
  const expired =
    row.expires_at != null && new Date(row.expires_at).getTime() < Date.now();
  return {
    id: row.id,
    title: `${row.claim_code}: ${row.statement}`,
    description: row.scope || 'Registered compliance claim',
    status: !row.is_active
      ? 'Unsupported'
      : expired
        ? 'Outdated'
        : row.is_regulated
          ? 'Needs legal review'
          : 'Supported',
    expiresAt: row.expires_at
      ? new Date(row.expires_at).toLocaleDateString()
      : undefined,
    reference: row.is_regulated ? 'Regulated' : 'Standard',
  };
}

export function toAuditEvent(row: BackendAuditLog): AuditEvent {
  return {
    id: row.id,
    actor: row.actor_id ? row.actor_id.slice(0, 8) : 'System',
    action: row.action,
    target: row.resource_id
      ? `${row.resource_type}:${row.resource_id.slice(0, 8)}`
      : row.resource_type,
    timestamp: row.created_at,
    detail: row.details ? JSON.stringify(row.details) : 'Recorded event',
  };
}

async function loginWithCredentials(
  email: string,
  password: string,
  tenantSlug: string,
  tenantName = 'Brand workspace',
): Promise<{ user: User; accessToken: string }> {
  const tokens = await request<TokenResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      tenant_slug: tenantSlug,
      email,
      password,
    }),
  });

  tokenStore.set(tokens.access_token);

  if (tokens.refresh_token) {
    localStorage.setItem('bg_refresh_token', tokens.refresh_token);
  }

  try {
    const [me, tenant] = await Promise.all([
      request<MeResponse>('/api/v1/auth/me'),
      request<TenantResponse>('/api/v1/tenants/current').catch(() => null),
    ]);

    const user: User = {
      id: me.user_id,
      name: email.split('@')[0],
      email,
      role: mapRole(me.roles),
      tenantName: tenant?.name || tenantName,
    };

    return { user, accessToken: tokens.access_token };
  } catch (error) {
    tokenStore.clear();
    throw error;
  }
}

export const authAdapter = {
  async login(
    email: string,
    password: string,
    tenantSlug: string,
    tenantName?: string,
  ) {
    return loginWithCredentials(email, password, tenantSlug, tenantName);
  },

  async register(input: {
    name: string;
    email: string;
    password: string;
    tenantName: string;
    tenantSlug: string;
  }) {
    await request<TenantResponse>('/api/v1/tenants', {
      method: 'POST',
      body: JSON.stringify({
        name: input.tenantName,
        slug: input.tenantSlug,
      }),
    });

    await request<BackendUser>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        tenant_slug: input.tenantSlug,
        email: input.email,
        full_name: input.name,
        password: input.password,
        roles: ['creator'],
      }),
    });

    return loginWithCredentials(
      input.email,
      input.password,
      input.tenantSlug,
      input.tenantName,
    );
  },

  async logout() {
    try {
      if (accessToken) {
        await request('/api/v1/auth/logout', { method: 'POST' }, false);
      }
    } finally {
      tokenStore.clear();
    }
  },

  async me(): Promise<{ userId: string; tenantId: string; role: Role }> {
    const me = await request<MeResponse>('/api/v1/auth/me');
    return {
      userId: me.user_id,
      tenantId: me.tenant_id,
      role: mapRole(me.roles),
    };
  },
};

export const submissionsApi = {
  async list(): Promise<Submission[]> {
    const rows = await request<BackendSubmission[]>('/api/v1/submissions');
    return rows.map(toSubmission);
  },

  async createText(input: {
    title: string;
    channel: string;
    audience: string;
    intent: string;
    contentFormat?: 'text' | 'markdown' | 'html' | 'social';
    sensitivityLabel?: 'public' | 'internal' | 'confidential' | 'regulated';
    rawText: string;
  }): Promise<Submission> {
    const row = await request<BackendSubmission>('/api/v1/submissions/text', {
      method: 'POST',
      body: JSON.stringify({
        title: input.title,
        channel: input.channel,
        audience: input.audience,
        intent: input.intent,
        content_format: input.contentFormat || 'text',
        sensitivity_label: input.sensitivityLabel || 'internal',
        raw_text: input.rawText,
      }),
    });
    return toSubmission(row);
  },

  async upload(input: {
    title: string;
    channel: string;
    audience: string;
    intent: string;
    contentFormat: 'text' | 'markdown' | 'html' | 'docx' | 'pdf' | 'image';
    sensitivityLabel?: 'public' | 'internal' | 'confidential' | 'regulated';
    file: File;
  }): Promise<Submission> {
    const fd = new FormData();
    fd.append('title', input.title);
    fd.append('channel', input.channel);
    fd.append('audience', input.audience);
    fd.append('intent', input.intent);
    fd.append('content_format', input.contentFormat);
    fd.append('sensitivity_label', input.sensitivityLabel || 'internal');
    fd.append('file', input.file);

    const row = await request<BackendSubmission>('/api/v1/submissions/upload', {
      method: 'POST',
      body: fd,
    });
    return toSubmission(row);
  },
};

export const reviewsApi = {
  start(submissionId: string) {
    return request<BackendReviewSession>('/api/v1/reviews', {
      method: 'POST',
      body: JSON.stringify({ submission_id: submissionId }),
    });
  },
  get(sessionId: string) {
    return request<BackendReviewSession>(`/api/v1/reviews/${sessionId}`);
  },
};

export const issuesApi = {
  async list(submissionId?: string): Promise<Finding[]> {
    const query = submissionId
      ? `?submission_id=${encodeURIComponent(submissionId)}`
      : '';
    const rows = await request<BackendIssue[]>(`/api/v1/issues${query}`);
    return rows.map(toFinding);
  },
};

export const guidelinesApi = {
  async list(): Promise<Guideline[]> {
    const rows = await request<BackendGuideline[]>('/api/v1/guidelines');
    return rows.map(toGuideline);
  },
  rules(guidelineId: string) {
    return request<BackendGuidelineRule[]>(
      `/api/v1/guidelines/${guidelineId}/rules`,
    );
  },
  async create(input: {
    title: string;
    version?: string;
    description?: string;
    rules?: Array<{
      rule_code: string;
      category: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      title: string;
      description: string;
    }>;
  }): Promise<Guideline> {
    const row = await request<BackendGuideline>('/api/v1/guidelines', {
      method: 'POST',
      body: JSON.stringify({
        title: input.title,
        version: input.version || '1.0',
        description: input.description || null,
        rules: input.rules || [],
      }),
    });
    return toGuideline(row);
  },
};

export const glossaryApi = {
  async list(): Promise<GlossaryTerm[]> {
    const rows = await request<BackendGlossaryEntry[]>('/api/v1/glossary');
    return rows.map(toGlossary);
  },
  async create(input: {
    term: string;
    status: 'approved' | 'prohibited';
    preferredTerm?: string;
    rationale?: string;
    category?: string;
  }): Promise<GlossaryTerm> {
    const row = await request<BackendGlossaryEntry>('/api/v1/glossary', {
      method: 'POST',
      body: JSON.stringify({
        term: input.term,
        status: input.status,
        preferred_term: input.preferredTerm || null,
        rationale: input.rationale || null,
        category: input.category || null,
      }),
    });
    return toGlossary(row);
  },
};

export const claimsApi = {
  async list(): Promise<Claim[]> {
    const rows = await request<BackendClaim[]>('/api/v1/claims');
    return rows.map(toClaim);
  },
  async create(input: {
    claimCode: string;
    statement: string;
    scope?: string;
    isRegulated?: boolean;
  }): Promise<Claim> {
    const row = await request<BackendClaim>('/api/v1/claims', {
      method: 'POST',
      body: JSON.stringify({
        claim_code: input.claimCode,
        statement: input.statement,
        scope: input.scope || null,
        is_regulated: Boolean(input.isRegulated),
        sources: [],
      }),
    });
    return toClaim(row);
  },
};

export interface BackendFix {
  id: string;
  issue_id: string;
  original_content: string;
  proposed_content: string;
  retry_count: number;
  validation_status: string;
  creator_decision: string | null;
  requires_human_review: boolean;
}

export interface BackendDispute {
  id: string;
  issue_id: string;
  creator_id: string;
  reason_code: string;
  rule_ref: string;
  explanation: string;
  status: string;
  reviewer_outcome: string | null;
}

export const fixesApi = {
  request(issueId: string) {
    return request<BackendFix>('/api/v1/fixes/request', {
      method: 'POST',
      body: JSON.stringify({ issue_id: issueId }),
    });
  },
  decide(
    fixId: string,
    decision: 'accepted' | 'edited' | 'rejected',
    editedContent?: string,
  ) {
    return request<BackendFix>(`/api/v1/fixes/${fixId}/decision`, {
      method: 'POST',
      body: JSON.stringify({
        decision,
        edited_content: editedContent || null,
      }),
    });
  },
};

export const disputesApi = {
  create(input: { issueId: string; reasonCode: string; explanation: string }) {
    return request<BackendDispute>('/api/v1/disputes', {
      method: 'POST',
      body: JSON.stringify({
        issue_id: input.issueId,
        reason_code: input.reasonCode,
        explanation: input.explanation,
      }),
    });
  },
};

export const approvalsApi = {
  decide(input: {
    submissionId: string;
    decision: 'approved' | 'rejected' | 'changes_requested';
    notes?: string;
  }) {
    return request('/api/v1/approvals', {
      method: 'POST',
      body: JSON.stringify({
        submission_id: input.submissionId,
        decision: input.decision,
        notes: input.notes || null,
      }),
    });
  },
};

export const analyticsApi = {
  dashboard() {
    return request<BackendAnalytics>('/api/v1/analytics/dashboard');
  },
};

export const auditApi = {
  async list(): Promise<AuditEvent[]> {
    const rows = await request<BackendAuditLog[]>('/api/v1/audit');
    return rows.map(toAuditEvent);
  },
};

export const usersApi = {
  list() {
    return request<BackendUser[]>('/api/v1/users');
  },
  create(input: {
    tenantSlug: string;
    email: string;
    fullName: string;
    password: string;
    roles: string[];
  }) {
    return request<BackendUser>('/api/v1/users', {
      method: 'POST',
      body: JSON.stringify({
        tenant_slug: input.tenantSlug,
        email: input.email,
        full_name: input.fullName,
        password: input.password,
        roles: input.roles,
      }),
    });
  },
};

export interface BackendAssignment {
  id: string;
  submission_id: string;
  review_session_id: string;
  assigned_role: string;
  routing_reason: string;
  status: string;
}

export interface BackendApproval {
  id: string;
  submission_id: string;
  content_version_id: string;
  reviewer_id: string;
  decision: string;
  notes: string | null;
  locked_version: boolean;
  created_at: string;
}

export interface BackendVisualAsset {
  id: string;
  tenant_id: string;
  name: string;
  asset_type: 'logo' | 'palette' | 'font' | 'template';
  description: string | null;
  metadata_json: Record<string, unknown> | null;
  storage_key: string | null;
  mime_type: string | null;
}

export interface BackendHealth {
  status: string;
  database?: string;
  redis?: string;
}

export const healthApi = {
  async ready(): Promise<BackendHealth> {
    try {
      return await request<BackendHealth>('/health/ready', {}, false);
    } catch {
      return { status: 'unreachable' };
    }
  },
};

export const rawGovernanceApi = {
  listSubmissions(limit = 50, offset = 0) {
    return request<BackendSubmission[]>(`/api/v1/submissions?limit=${limit}&offset=${offset}`);
  },
  getSubmission(submissionId: string) {
    return request<BackendSubmission>(`/api/v1/submissions/${submissionId}`);
  },
  submitText(input: {
    title: string;
    channel: string;
    audience: string;
    intent: string;
    content_format?: 'text' | 'markdown' | 'html' | 'social';
    sensitivity_label?: 'public' | 'internal' | 'confidential' | 'regulated';
    raw_text: string;
  }) {
    return request<BackendSubmission>('/api/v1/submissions/text', {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        content_format: input.content_format || 'text',
        sensitivity_label: input.sensitivity_label || 'internal',
      }),
    });
  },
  uploadFile(input: {
    title: string;
    channel: string;
    audience: string;
    intent: string;
    content_format: 'text' | 'markdown' | 'html' | 'docx' | 'pdf' | 'image';
    sensitivity_label?: 'public' | 'internal' | 'confidential' | 'regulated';
    file: File;
  }) {
    const fd = new FormData();
    fd.append('title', input.title);
    fd.append('channel', input.channel);
    fd.append('audience', input.audience);
    fd.append('intent', input.intent);
    fd.append('content_format', input.content_format);
    fd.append('sensitivity_label', input.sensitivity_label || 'internal');
    fd.append('file', input.file);
    return request<BackendSubmission>('/api/v1/submissions/upload', {
      method: 'POST',
      body: fd,
    });
  },
  listIssues(params?: { submissionId?: string; reviewSessionId?: string }) {
    const q = new URLSearchParams();
    if (params?.submissionId) q.set('submission_id', params.submissionId);
    if (params?.reviewSessionId) q.set('review_session_id', params.reviewSessionId);
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return request<BackendIssue[]>(`/api/v1/issues${suffix}`);
  },
  listAssignments() {
    return request<BackendAssignment[]>('/api/v1/assignments');
  },
  decideApproval(input: {
    submission_id: string;
    decision: 'approved' | 'rejected' | 'changes_requested';
    notes?: string | null;
  }) {
    return request<BackendApproval>('/api/v1/approvals', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  listRawGuidelines() {
    return request<BackendGuideline[]>('/api/v1/guidelines');
  },
  listRawGlossary() {
    return request<BackendGlossaryEntry[]>('/api/v1/glossary');
  },
  listRawClaims() {
    return request<BackendClaim[]>('/api/v1/claims');
  },
  listStaleClaims() {
    return request<BackendClaim[]>('/api/v1/claims/stale');
  },
  listAssets() {
    return request<BackendVisualAsset[]>('/api/v1/assets');
  },
  listRawAuditLogs() {
    return request<BackendAuditLog[]>('/api/v1/audit');
  },
};
