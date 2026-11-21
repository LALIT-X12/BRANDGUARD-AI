import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  MessageSquare,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  Button,
  Card,
  EmptyState,
  FilterSelect,
  PageHeader,
  SearchBox,
  SectionTitle,
  StatCard,
  StatusPill,
} from '../components/UI';
import { useApp } from '../contexts/AppContext';
import {
  DEMO_MODE,
  analyticsApi,
  approvalsApi,
  auditApi,
  claimsApi,
  disputesApi,
  fixesApi,
  glossaryApi,
  guidelinesApi,
  issuesApi,
  reviewsApi,
  submissionsApi,
  usersApi,
  type BackendAnalytics,
  type BackendFix,
  type BackendGuidelineRule,
} from '../services/api';
import {
  demoAudit,
  demoClaims,
  demoFindings,
  demoGlossary,
  demoGuidelines,
} from '../services/demo';
import type {
  AuditEvent,
  Claim,
  Finding,
  GlossaryTerm,
  Guideline,
  Status,
  Submission,
} from '../types';

const pieColors = ['#A47759', '#D8BFA8', '#BD9475', '#8B795E'];

function DemoFlag() {
  return DEMO_MODE ? (
    <div className="demo-banner">
      <span /> DEMO WORKSPACE · Sample records stored locally in this browser.
    </div>
  ) : null;
}

function inferUploadFormat(
  file: File,
): 'text' | 'markdown' | 'html' | 'docx' | 'pdf' | 'image' {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx') || name.endsWith('.doc')) return 'docx';
  if (name.endsWith('.html') || name.endsWith('.htm')) return 'html';
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'markdown';
  if (file.type.startsWith('image/')) return 'image';
  return 'text';
}

export function Overview() {
  const { submissions, submissionsLoading, submissionsError, refreshSubmissions } =
    useApp();
  const nav = useNavigate();
  const total = submissions.length;
  const count = (s: Status) => submissions.filter((x) => x.status === s).length;

  const activityData = useMemo(() => {
    const byDay = new Map<string, { day: string; submissions: number; approved: number }>();
    for (const s of submissions) {
      const day = new Date(s.submittedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
      const prev = byDay.get(day) || { day, submissions: 0, approved: 0 };
      prev.submissions += 1;
      if (s.status === 'Approved') prev.approved += 1;
      byDay.set(day, prev);
    }
    return Array.from(byDay.values()).reverse().slice(-7);
  }, [submissions]);

  const statusPie = useMemo(() => {
    const approved = count('Approved');
    const changes = count('Changes Requested');
    const rejected = count('Rejected') + count('Failed');
    const pending = total - approved - changes - rejected;
    return [
      { name: 'Approved', value: approved },
      { name: 'Pending', value: pending },
      { name: 'Changes', value: changes },
      { name: 'Rejected', value: rejected },
    ].filter((d) => d.value > 0);
  }, [submissions, total]);

  return (
    <>
      <DemoFlag />
      <PageHeader
        eyebrow="LIVE WORKSPACE"
        title="Good morning. Stay on brand."
        subtitle="A clear view of your content, compliance and approvals."
        action={
          <Button onClick={() => nav('/submissions/new')}>
            <Plus size={16} /> New submission
          </Button>
        }
      />

      {submissionsError && <div className="form-error">{submissionsError}</div>}

      <div className="stat-grid">
        <StatCard
          label="Total submissions"
          value={submissionsLoading ? '…' : total}
          change={DEMO_MODE ? 'Demo workspace' : 'Synced from backend'}
          icon={FileText}
        />
        <StatCard
          label="Pending review"
          value={count('Processing') + count('Submitted') + count('Queued') + count('Completed')}
          change="Awaiting final decision"
          icon={Clock3}
          tone="latte"
        />
        <StatCard
          label="Approved content"
          value={count('Approved')}
          change="Ready to publish"
          icon={CheckCircle2}
          tone="green"
        />
        <StatCard
          label="Needs attention"
          value={count('Changes Requested') + count('Rejected') + count('Failed')}
          change="Action recommended"
          icon={AlertTriangle}
          tone="amber"
        />
      </div>

      <div className="dashboard-grid">
        <Card className="chart-card">
          <SectionTitle
            title="Submission activity"
            link="View analytics"
            onLink={() => nav('/analytics')}
          />
          <p className="card-subtitle">Live submissions grouped by date</p>
          {activityData.length > 0 ? (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityData}>
                  <defs>
                    <linearGradient id="brownFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#A47759" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#A47759" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#eee4da"
                  />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#9b8878', fontSize: 12 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#9b8878', fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #eee4da',
                      boxShadow: '0 8px 24px #5d3c2015',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="submissions"
                    stroke="#A47759"
                    strokeWidth={2.5}
                    fill="url(#brownFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="No submission activity yet"
              detail="Submit your first campaign draft to start tracking live activity."
              action={
                <Button
                  variant="secondary"
                  onClick={() => nav('/submissions/new')}
                >
                  Submit content
                </Button>
              }
            />
          )}
        </Card>

        <Card className="approval-card">
          <SectionTitle
            title="Approval health"
            link="Refresh"
            onLink={() => void refreshSubmissions()}
          />
          <p className="card-subtitle">Current workspace distribution</p>
          {statusPie.length > 0 ? (
            <>
              <div className="donut-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusPie}
                      dataKey="value"
                      innerRadius={57}
                      outerRadius={78}
                      paddingAngle={4}
                      stroke="none"
                    >
                      {statusPie.map((x, i) => (
                        <Cell
                          key={x.name}
                          fill={pieColors[i % pieColors.length]}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center">
                  <b>{total}</b>
                  <span>total</span>
                </div>
              </div>
              <div className="legend-list">
                {statusPie.map((p, i) => (
                  <div key={p.name}>
                    <i style={{ background: pieColors[i % pieColors.length] }} />
                    <span>{p.name}</span>
                    <b>{p.value}</b>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              title="No decisions yet"
              detail="Submission statuses will appear here once content is submitted."
            />
          )}
        </Card>
      </div>

      <Card className="table-card">
        <SectionTitle
          title="Recent submissions"
          link="View all submissions"
          onLink={() => nav('/submissions')}
        />
        <SubmissionTable
          items={submissions.slice(0, 5)}
          onOpen={(id) => nav(`/reviews?submission=${encodeURIComponent(id)}`)}
        />
      </Card>
    </>
  );
}

function SubmissionTable({
  items,
  onOpen,
}: {
  items: Submission[];
  onOpen: (id: string) => void;
}) {
  return items.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Platform</th>
            <th>Submitted</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id}>
              <td>
                <div className="table-primary">{s.campaign}</div>
                <small>
                  {s.id.slice(0, 8)} · {s.filename}
                </small>
              </td>
              <td>{s.platform}</td>
              <td>{new Date(s.submittedAt).toLocaleDateString()}</td>
              <td>
                <StatusPill status={s.status} />
              </td>
              <td>
                <button
                  className="row-action"
                  onClick={() => onOpen(s.id)}
                  aria-label="Open submission"
                >
                  <ArrowUpRight size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <EmptyState
      title="No submissions yet"
      detail="Submit your first campaign asset to begin a brand review."
    />
  );
}

export function Dashboard() {
  return <Overview />;
}

export function Submissions() {
  const { submissions, submissionsLoading, submissionsError, refreshSubmissions } =
    useApp();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get('q') || '');
  const [status, setStatus] = useState('All statuses');

  useEffect(() => {
    setQ(searchParams.get('q') || '');
  }, [searchParams]);

  const filtered = submissions.filter(
    (s) =>
      (s.campaign + s.id + s.filename + s.platform)
        .toLowerCase()
        .includes(q.toLowerCase()) &&
      (status === 'All statuses' || s.status === status),
  );

  return (
    <>
      <DemoFlag />
      <PageHeader
        eyebrow="CONTENT WORKFLOW"
        title="Content submissions"
        subtitle="Manage every asset from first upload to final decision."
        action={
          <Button onClick={() => nav('/submissions/new')}>
            <Plus size={16} /> Submit content
          </Button>
        }
      />
      {submissionsError && <div className="form-error">{submissionsError}</div>}
      <div className="toolbar">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search campaigns, IDs, files..."
        />
        <FilterSelect
          value={status}
          onChange={setStatus}
          options={[
            'All statuses',
            'Submitted',
            'Queued',
            'Processing',
            'Completed',
            'Changes Requested',
            'Approved',
            'Rejected',
            'Failed',
          ]}
        />
        <Button
          variant="secondary"
          onClick={() => void refreshSubmissions()}
          disabled={submissionsLoading}
        >
          <RefreshCw size={14} /> Refresh
        </Button>
        <span className="result-count">{filtered.length} records</span>
      </div>
      <Card className="table-card">
        <SubmissionTable
          items={filtered}
          onOpen={(id) => nav(`/reviews?submission=${encodeURIComponent(id)}`)}
        />
      </Card>
    </>
  );
}

export function NewSubmission() {
  const { addSubmission, refreshSubmissions, toast } = useApp();
  const nav = useNavigate();
  const [campaign, setCampaign] = useState('');
  const [platform, setPlatform] = useState('Instagram');
  const [category, setCategory] = useState('Social media');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (campaign.trim().length < 2 || (!file && !content.trim())) {
      setError('Enter a campaign name and provide text or upload a file.');
      return;
    }

    setBusy(true);
    try {
      if (DEMO_MODE) {
        const s: Submission = {
          id: `BG-${Math.floor(2410 + Math.random() * 500)}`,
          campaign: campaign.trim(),
          platform,
          category,
          filename: file?.name || 'Text submission',
          submittedAt: new Date().toISOString(),
          status: 'Submitted',
          submittedBy: 'You',
          description: description.trim() || undefined,
        };
        addSubmission(s);
        toast('Submission saved in local demo workspace.');
        nav('/submissions');
        return;
      }

      const intent =
        description.trim().length >= 2
          ? description.trim()
          : `${category} campaign review for ${platform}`;

      const created = file
        ? await submissionsApi.upload({
            title: campaign.trim(),
            channel: platform.toLowerCase(),
            audience: category,
            intent,
            contentFormat: inferUploadFormat(file),
            sensitivityLabel: 'internal',
            file,
          })
        : await submissionsApi.createText({
            title: campaign.trim(),
            channel: platform.toLowerCase(),
            audience: category,
            intent,
            contentFormat: 'text',
            sensitivityLabel: 'internal',
            rawText: content.trim(),
          });

      addSubmission(created);
      let reviewMsg = 'Submission analyzed — review results are ready.';
      try {
        const session = await reviewsApi.start(created.id);
        if (session.risk_level) {
          reviewMsg = `AI review completed (${session.risk_level} risk).`;
        }
      } catch (reviewErr) {
        reviewMsg = `Submission saved, but AI review reported: ${
          reviewErr instanceof Error ? reviewErr.message : 'check reviews page'
        }`;
      }
      await refreshSubmissions();
      toast(reviewMsg);
      nav(`/reviews?submission=${encodeURIComponent(created.id)}`);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not submit content.';
      setError(msg);
      toast(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="NEW CONTENT"
        title="Submit for review"
        subtitle="Share a draft or asset with your brand governance team."
      />
      {error && <div className="form-error">{error}</div>}
      <form className="submission-layout" onSubmit={submit}>
        <div className="form-main">
          <Card className="form-card">
            <h2>Campaign details</h2>
            <p className="card-subtitle">
              Tell reviewers where this content will appear.
            </p>
            <label className="field">
              <span>Campaign name *</span>
              <input
                required
                minLength={2}
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                placeholder="e.g. Summer product launch"
              />
            </label>
            <div className="two-fields">
              <label className="field">
                <span>Platform *</span>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                >
                  {[
                    'Instagram',
                    'LinkedIn',
                    'Facebook',
                    'Website',
                    'Email',
                    'YouTube',
                    'Print',
                    'Other',
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Category *</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {[
                    'Social media',
                    'Campaign',
                    'Product marketing',
                    'Email',
                    'Case study',
                    'Advertisement',
                    'Other',
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>Description / review context</span>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Audience, objective, market, or anything reviewers should know..."
              />
            </label>
          </Card>

          <Card className="form-card">
            <h2>Content and assets</h2>
            <p className="card-subtitle">
              Upload a file or paste the content to be reviewed.
            </p>
            <label className="upload-zone">
              <UploadCloud size={26} />
              <b>{file ? file.name : 'Choose a file or drag it here'}</b>
              <span>Images, PDF, DOCX, HTML, Markdown and plain text</span>
              <input
                type="file"
                accept="image/*,.pdf,.doc,.docx,.txt,.md,.html"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
            <div className="or-divider">
              <span>OR PASTE CONTENT</span>
            </div>
            <textarea
              className="content-area"
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste your social caption, headline, email copy or campaign text..."
            />
          </Card>
        </div>

        <div className="form-aside">
          <Card className="guidance-card">
            <div className="aside-icon">
              <ShieldCheck size={20} />
            </div>
            <h3>What happens next?</h3>
            <ol>
              <li>
                <b>Submission ingested</b>
                <span>Saved to the backend database for your workspace.</span>
              </li>
              <li>
                <b>AI compliance review</b>
                <span>Review session starts and evaluates rules & claims.</span>
              </li>
              <li>
                <b>Human approval</b>
                <span>Authorised reviewers confirm findings and decide.</span>
              </li>
            </ol>
            <p className="micro-note">
              AI findings are advisory. Final approval remains with an authorised
              reviewer.
            </p>
          </Card>
          <div className="form-actions">
            <Button
              type="submit"
              disabled={busy || (!file && !content.trim())}
            >
              {busy ? 'Submitting…' : 'Submit for review'}
              <ArrowUpRight size={16} />
            </Button>
            <Button variant="secondary" onClick={() => nav('/submissions')}>
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}

function FindingResolutionControls({
  finding,
  onUpdated,
}: {
  finding: Finding;
  onUpdated: () => Promise<void> | void;
}) {
  const { toast } = useApp();
  const [fix, setFix] = useState<BackendFix | null>(null);
  const [fixing, setFixing] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState('false_positive');
  const [explanation, setExplanation] = useState('');
  const [disputing, setDisputing] = useState(false);

  if (DEMO_MODE) return null;
  const status = (finding.location || '').toLowerCase();
  if (status === 'fixed' || status === 'disputed') return null;

  const generateFix = async () => {
    setFixing(true);
    try {
      const res = await fixesApi.request(finding.id);
      setFix(res);
      toast(
        res.validation_status === 'validated'
          ? 'AI fix generated and validated.'
          : 'AI draft fix ready (human verification recommended).',
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not generate AI fix.');
    } finally {
      setFixing(false);
    }
  };

  const decideFix = async (decision: 'accepted' | 'rejected') => {
    if (!fix) return;
    setDeciding(true);
    try {
      await fixesApi.decide(fix.id, decision);
      setFix(null);
      toast(
        decision === 'accepted'
          ? 'AI fix accepted and issue marked fixed.'
          : 'Suggested fix dismissed.',
      );
      await onUpdated();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save fix decision.');
    } finally {
      setDeciding(false);
    }
  };

  const submitDispute = async (e: FormEvent) => {
    e.preventDefault();
    if (explanation.trim().length < 5) {
      toast('Enter at least 5 characters explaining the dispute.');
      return;
    }
    setDisputing(true);
    try {
      await disputesApi.create({
        issueId: finding.id,
        reasonCode,
        explanation: explanation.trim(),
      });
      setDisputeOpen(false);
      setExplanation('');
      toast('Issue dispute submitted for review.');
      await onUpdated();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not submit dispute.');
    } finally {
      setDisputing(false);
    }
  };

  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button
          variant="secondary"
          disabled={fixing}
          onClick={() => void generateFix()}
        >
          <Sparkles size={14} /> {fixing ? 'Generating fix…' : 'Generate AI fix'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setDisputeOpen((v) => !v)}
        >
          {disputeOpen ? 'Cancel dispute' : 'Dispute'}
        </Button>
      </div>

      {fix && (
        <div className="suggestion" style={{ marginTop: 4 }}>
          <b>
            AI suggested rewrite (
            {fix.validation_status === 'validated'
              ? 'Validated'
              : 'Needs review'}
            )
          </b>
          <p style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>
            {fix.proposed_content}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Button
              disabled={deciding}
              onClick={() => void decideFix('accepted')}
            >
              <Check size={14} /> Accept fix
            </Button>
            <Button
              variant="secondary"
              disabled={deciding}
              onClick={() => void decideFix('rejected')}
            >
              <X size={14} /> Reject
            </Button>
          </div>
        </div>
      )}

      {disputeOpen && (
        <form
          onSubmit={submitDispute}
          style={{
            padding: 12,
            borderRadius: 10,
            border: '1px solid #eee4da',
            background: '#faf6f2',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <label className="field">
            <span>Reason code</span>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
            >
              <option value="false_positive">False positive</option>
              <option value="approved_exception">Approved brand exception</option>
              <option value="context_verified">Substantiated in campaign context</option>
              <option value="other">Other rationale</option>
            </select>
          </label>
          <label className="field">
            <span>Explanation *</span>
            <textarea
              required
              minLength={5}
              rows={2}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Explain why this finding should be reconsidered..."
            />
          </label>
          <div>
            <Button type="submit" disabled={disputing}>
              {disputing ? 'Submitting…' : 'Submit dispute'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function Reviews() {
  const { submissions, refreshSubmissions, toast } = useApp();
  const [searchParams] = useSearchParams();
  const querySubId = searchParams.get('submission') || '';
  const [selectedId, setSelectedId] = useState<string>(
    () => querySubId || submissions[0]?.id || '',
  );
  const [findings, setFindings] = useState<Finding[]>(
    DEMO_MODE ? demoFindings : [],
  );
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (querySubId) {
      setSelectedId(querySubId);
    } else if (!selectedId && submissions[0]?.id) {
      setSelectedId(submissions[0].id);
    }
  }, [querySubId, submissions, selectedId]);

  const loadIssues = useCallback(async () => {
    if (DEMO_MODE) return;
    setLoading(true);
    setError('');
    try {
      const list = await issuesApi.list(selectedId || undefined);
      setFindings(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load issues.');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadIssues();
  }, [loadIssues]);

  const startReview = async () => {
    if (!selectedId || DEMO_MODE) return;
    setRunning(true);
    setError('');
    try {
      const session = await reviewsApi.start(selectedId);
      toast(
        `AI review ${session.status}${
          session.risk_level ? ` (${session.risk_level} risk)` : ''
        }.`,
      );
      await Promise.all([loadIssues(), refreshSubmissions()]);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not start review session.';
      setError(msg);
      toast(msg);
    } finally {
      setRunning(false);
    }
  };

  const selectedSub = submissions.find((s) => s.id === selectedId);

  return (
    <>
      <DemoFlag />
      <PageHeader
        eyebrow="AI ASSISTED VERIFICATION"
        title="AI reviews"
        subtitle="Evidence-led findings from your brand compliance workflow."
        action={
          !DEMO_MODE && selectedId ? (
            <Button onClick={() => void startReview()} disabled={running}>
              <RefreshCw size={15} />{' '}
              {running ? 'Starting review…' : 'Run AI review'}
            </Button>
          ) : undefined
        }
      />

      {error && <div className="form-error">{error}</div>}

      {!DEMO_MODE && submissions.length > 0 && (
        <div className="toolbar">
          <div className="filter-select" style={{ minWidth: 280 }}>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {submissions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.campaign} ({s.status})
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="secondary"
            onClick={() => void loadIssues()}
            disabled={loading}
          >
            <RefreshCw size={14} /> Refresh findings
          </Button>
        </div>
      )}

      <Card className="review-feature">
        {selectedSub ? (
          <>
            <div className="review-feature-top">
              <div className="review-icon">
                <ShieldCheck size={23} />
              </div>
              <div>
                <span className="eyebrow">
                  SUBMISSION · {selectedSub.id.slice(0, 8)}
                </span>
                <h2>{selectedSub.campaign}</h2>
                <p>
                  {selectedSub.platform} · {selectedSub.category} ·{' '}
                  {selectedSub.filename}
                </p>
              </div>
              <StatusPill status={selectedSub.status} />
            </div>

            <div className="review-body">
              <div className="review-content">
                <span className="eyebrow">SUBMISSION CONTEXT</span>
                <div className="preview-paper">
                  <h3>{selectedSub.campaign}</h3>
                  <p>
                    {selectedSub.description ||
                      'Submitted for brand compliance evaluation.'}
                  </p>
                </div>
              </div>

              <div className="review-findings">
                <span className="eyebrow">
                  DETECTED FINDINGS ({findings.length})
                </span>
                {loading ? (
                  <p className="card-subtitle">Loading findings…</p>
                ) : findings.length > 0 ? (
                  findings.map((f) => (
                    <div className="finding" key={f.id}>
                      <div className="finding-top">
                        <StatusPill status={f.severity} />
                        <span>
                          {f.kind} · {Math.round((f.confidence || 0) * 100)}%
                        </span>
                      </div>
                      <b>{f.title}</b>
                      <p>{f.description}</p>
                      <small>
                        <BookOpen size={13} />
                        {f.source} · {f.location}
                      </small>
                      {f.suggestion && (
                        <div className="suggestion">
                          <b>Suggested direction</b>
                          <p>{f.suggestion}</p>
                        </div>
                      )}
                      <FindingResolutionControls
                        finding={f}
                        onUpdated={loadIssues}
                      />
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title="No findings recorded yet"
                    detail="Click Run AI review above to evaluate this submission against your guidelines."
                  />
                )}
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            title="No submissions available"
            detail="Submit content first to run an AI compliance review."
          />
        )}
      </Card>
    </>
  );
}

export function Guidelines() {
  const { toast } = useApp();
  const [items, setItems] = useState<Guideline[]>(
    DEMO_MODE ? demoGuidelines : [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('1.0');
  const [description, setDescription] = useState('');
  const [ruleCode, setRuleCode] = useState('');
  const [ruleTitle, setRuleTitle] = useState('');
  const [ruleSeverity, setRuleSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [ruleDesc, setRuleDesc] = useState('');
  const [selectedRules, setSelectedRules] = useState<{
    guidelineTitle: string;
    rules: BackendGuidelineRule[];
  } | null>(null);

  const load = useCallback(async () => {
    if (DEMO_MODE) return;
    setLoading(true);
    setError('');
    try {
      setItems(await guidelinesApi.list());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load guidelines.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      const hasRule = ruleCode.trim().length >= 2 && ruleTitle.trim().length >= 2;
      const created = await guidelinesApi.create({
        title: title.trim(),
        version: version.trim() || '1.0',
        description: description.trim() || undefined,
        rules: hasRule
          ? [
              {
                rule_code: ruleCode.trim(),
                category: 'tone',
                severity: ruleSeverity,
                title: ruleTitle.trim(),
                description: ruleDesc.trim() || ruleTitle.trim(),
              },
            ]
          : undefined,
      });
      setItems((prev) => [created, ...prev]);
      setTitle('');
      setDescription('');
      setRuleCode('');
      setRuleTitle('');
      setRuleDesc('');
      setCreating(false);
      toast('Guideline created.');
    } catch (err) {
      toast(
        err instanceof Error ? err.message : 'Could not create guideline.',
      );
    }
  };

  const viewRules = async (g: Guideline) => {
    if (DEMO_MODE) return;
    try {
      const rules = await guidelinesApi.rules(g.id);
      setSelectedRules({ guidelineTitle: g.title, rules });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load rules.');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="BRAND KNOWLEDGE"
        title="Brand guidelines"
        subtitle="The standards that keep every brand expression consistent."
        action={
          !DEMO_MODE ? (
            <Button
              variant="secondary"
              onClick={() => setCreating((v) => !v)}
            >
              <Plus size={16} /> {creating ? 'Close' : 'Add guideline'}
            </Button>
          ) : undefined
        }
      />

      {error && <div className="form-error">{error}</div>}

      {creating && (
        <Card className="form-card" style={{ marginBottom: 16 }}>
          <h2>Create guideline</h2>
          <form onSubmit={handleCreate}>
            <div className="two-fields">
              <label className="field">
                <span>Title *</span>
                <input
                  required
                  minLength={2}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Brand Voice Standard"
                />
              </label>
              <label className="field">
                <span>Version</span>
                <input
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="1.0"
                />
              </label>
            </div>
            <label className="field">
              <span>Description</span>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe this guideline..."
              />
            </label>
            <div className="two-fields" style={{ marginTop: 10 }}>
              <label className="field">
                <span>Initial rule code (optional)</span>
                <input
                  value={ruleCode}
                  onChange={(e) => setRuleCode(e.target.value)}
                  placeholder="e.g. TONE-01"
                />
              </label>
              <label className="field">
                <span>Rule severity</span>
                <select
                  value={ruleSeverity}
                  onChange={(e) =>
                    setRuleSeverity(
                      e.target.value as 'low' | 'medium' | 'high' | 'critical',
                    )
                  }
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
                </select>
              </label>
            </div>
            <div className="two-fields">
              <label className="field">
                <span>Rule title (optional)</span>
                <input
                  value={ruleTitle}
                  onChange={(e) => setRuleTitle(e.target.value)}
                  placeholder='e.g. Avoid "best in the world" claims'
                />
              </label>
              <label className="field">
                <span>Rule enforcement description</span>
                <input
                  value={ruleDesc}
                  onChange={(e) => setRuleDesc(e.target.value)}
                  placeholder='Quote banned terms e.g. Avoid "miracle"'
                />
              </label>
            </div>
            <div style={{ marginTop: 14 }}>
              <Button type="submit">Save guideline</Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <Card className="table-card">
          <p className="card-subtitle">Loading guidelines…</p>
        </Card>
      ) : items.length > 0 ? (
        <div className="guideline-grid">
          {items.map((g) => (
            <Card className="guideline-card" key={g.id}>
              <div className="guideline-icon">
                <MessageSquare size={20} />
              </div>
              <span className="eyebrow">{g.category}</span>
              <h3>{g.title}</h3>
              <p>{g.description}</p>
              <div className="guideline-foot">
                <span>Active standard</span>
                <button onClick={() => void viewRules(g)}>
                  View rules <ArrowUpRight size={14} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="table-card">
          <EmptyState
            title="No guidelines yet"
            detail="Add your workspace’s first brand guideline to start governing content."
          />
        </Card>
      )}

      {selectedRules && (
        <Card className="table-card" style={{ marginTop: 16 }}>
          <SectionTitle
            title={`Rules: ${selectedRules.guidelineTitle}`}
            link="Close"
            onLink={() => setSelectedRules(null)}
          />
          {selectedRules.rules.length > 0 ? (
            <div className="issue-list">
              {selectedRules.rules.map((r) => (
                <div className="issue-row" key={r.id}>
                  <div className="issue-copy">
                    <b>
                      {r.rule_code} · {r.title}
                    </b>
                    <p>{r.description}</p>
                    <small>{r.category}</small>
                  </div>
                  <StatusPill status={r.severity} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No rules in this guideline"
              detail="No structured rules have been attached to this guideline yet."
            />
          )}
        </Card>
      )}
    </>
  );
}

export function Issues() {
  const [q, setQ] = useState('');
  const [severity, setSeverity] = useState('All severity');
  const [items, setItems] = useState<Finding[]>(
    DEMO_MODE ? demoFindings : [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (DEMO_MODE) return;
    setLoading(true);
    setError('');
    try {
      setItems(await issuesApi.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load issues.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const list = items.filter(
    (f) =>
      (f.title + f.description).toLowerCase().includes(q.toLowerCase()) &&
      (severity === 'All severity' || f.severity === severity),
  );

  return (
    <>
      <PageHeader
        eyebrow="COMPLIANCE OPERATIONS"
        title="Issue management"
        subtitle="Find, prioritise and resolve brand compliance issues."
      />
      {error && <div className="form-error">{error}</div>}
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} />
        <FilterSelect
          value={severity}
          onChange={setSeverity}
          options={[
            'All severity',
            'Critical',
            'High',
            'Medium',
            'Low',
            'Informational',
          ]}
        />
        {!DEMO_MODE && (
          <Button
            variant="secondary"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={14} /> Refresh
          </Button>
        )}
      </div>
      <Card className="table-card">
        {loading ? (
          <p className="card-subtitle">Loading issues…</p>
        ) : list.length > 0 ? (
          <div className="issue-list">
            {list.map((f) => (
              <div className="issue-row" key={f.id}>
                <div className="issue-severity">
                  <AlertTriangle size={18} />
                </div>
                <div className="issue-copy" style={{ flex: 1 }}>
                  <b>{f.title}</b>
                  <p>{f.description}</p>
                  <small>
                    {f.source} · {f.location}
                  </small>
                  {f.suggestion && (
                    <div className="suggestion" style={{ marginTop: 8 }}>
                      <b>Suggested direction</b>
                      <p>{f.suggestion}</p>
                    </div>
                  )}
                  <FindingResolutionControls finding={f} onUpdated={load} />
                </div>
                <StatusPill status={f.severity} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No compliance issues found"
            detail="Issues detected during AI reviews will appear here."
          />
        )}
      </Card>
    </>
  );
}

export function Claims() {
  const { toast } = useApp();
  const [q, setQ] = useState('');
  const [claims, setClaims] = useState<Claim[]>(DEMO_MODE ? demoClaims : []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [claimCode, setClaimCode] = useState('');
  const [statement, setStatement] = useState('');
  const [scope, setScope] = useState('');

  const load = useCallback(async () => {
    if (DEMO_MODE) return;
    setLoading(true);
    setError('');
    try {
      setClaims(await claimsApi.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load claims.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!claimCode.trim() || !statement.trim()) return;
    try {
      const created = await claimsApi.create({
        claimCode: claimCode.trim(),
        statement: statement.trim(),
        scope: scope.trim() || undefined,
      });
      setClaims((prev) => [created, ...prev]);
      setClaimCode('');
      setStatement('');
      setScope('');
      setCreating(false);
      toast('Claim registered.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not register claim.');
    }
  };

  const items = claims.filter((c) =>
    (c.title + c.description).toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        eyebrow="EVIDENCE & TRUST"
        title="Claims registry"
        subtitle="Keep product, performance and compliance claims tied to current evidence."
        action={
          !DEMO_MODE ? (
            <Button
              variant="secondary"
              onClick={() => setCreating((v) => !v)}
            >
              <Plus size={16} /> {creating ? 'Close' : 'Register claim'}
            </Button>
          ) : undefined
        }
      />
      {error && <div className="form-error">{error}</div>}
      {creating && (
        <Card className="form-card" style={{ marginBottom: 16 }}>
          <h2>Register approved claim</h2>
          <form onSubmit={handleCreate}>
            <div className="two-fields">
              <label className="field">
                <span>Claim code *</span>
                <input
                  required
                  minLength={2}
                  value={claimCode}
                  onChange={(e) => setClaimCode(e.target.value)}
                  placeholder="e.g. CLM-001"
                />
              </label>
              <label className="field">
                <span>Scope</span>
                <input
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  placeholder="e.g. Enterprise web & social"
                />
              </label>
            </div>
            <label className="field">
              <span>Statement *</span>
              <textarea
                required
                rows={2}
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                placeholder="Exact substantiated claim wording..."
              />
            </label>
            <div style={{ marginTop: 14 }}>
              <Button type="submit">Save claim</Button>
            </div>
          </form>
        </Card>
      )}
      <div className="toolbar">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search registered claims..."
        />
        <span className="result-count">{items.length} claims</span>
      </div>
      <Card className="table-card">
        {loading ? (
          <p className="card-subtitle">Loading claims…</p>
        ) : items.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Claim</th>
                  <th>Verification</th>
                  <th>Classification</th>
                  <th>Valid until</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="table-primary">{c.title}</div>
                      <small>{c.description}</small>
                    </td>
                    <td>
                      <StatusPill status={c.status} />
                    </td>
                    <td>{c.reference}</td>
                    <td>{c.expiresAt || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No claims registered"
            detail="Register substantiated product and compliance claims for your workspace."
          />
        )}
      </Card>
    </>
  );
}

export function Glossary() {
  const { toast } = useApp();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('All terms');
  const [terms, setTerms] = useState<GlossaryTerm[]>(
    DEMO_MODE ? demoGlossary : [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState<'approved' | 'prohibited'>('approved');
  const [preferredTerm, setPreferredTerm] = useState('');
  const [rationale, setRationale] = useState('');

  const load = useCallback(async () => {
    if (DEMO_MODE) return;
    setLoading(true);
    setError('');
    try {
      setTerms(await glossaryApi.list());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load glossary.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return;
    try {
      const created = await glossaryApi.create({
        term: term.trim(),
        status,
        preferredTerm: preferredTerm.trim() || undefined,
        rationale: rationale.trim() || undefined,
      });
      setTerms((prev) => [created, ...prev]);
      setTerm('');
      setPreferredTerm('');
      setRationale('');
      setCreating(false);
      toast('Glossary term saved.');
    } catch (err) {
      toast(
        err instanceof Error ? err.message : 'Could not save glossary term.',
      );
    }
  };

  const items = terms.filter(
    (g) =>
      (g.term + g.definition).toLowerCase().includes(q.toLowerCase()) &&
      (tab === 'All terms' || g.type === tab),
  );

  return (
    <>
      <PageHeader
        eyebrow="LANGUAGE CONSISTENCY"
        title="Brand glossary"
        subtitle="A shared vocabulary for clear, consistent communication."
        action={
          !DEMO_MODE ? (
            <Button
              variant="secondary"
              onClick={() => setCreating((v) => !v)}
            >
              <Plus size={16} /> {creating ? 'Close' : 'Add term'}
            </Button>
          ) : undefined
        }
      />
      {error && <div className="form-error">{error}</div>}
      {creating && (
        <Card className="form-card" style={{ marginBottom: 16 }}>
          <h2>Add glossary term</h2>
          <form onSubmit={handleCreate}>
            <div className="two-fields">
              <label className="field">
                <span>Term *</span>
                <input
                  required
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="e.g. guaranteed results"
                />
              </label>
              <label className="field">
                <span>Status *</span>
                <select
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as 'approved' | 'prohibited')
                  }
                >
                  <option value="approved">Approved</option>
                  <option value="prohibited">Prohibited</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Preferred alternative</span>
              <input
                value={preferredTerm}
                onChange={(e) => setPreferredTerm(e.target.value)}
                placeholder="Optional preferred replacement"
              />
            </label>
            <label className="field">
              <span>Rationale</span>
              <textarea
                rows={2}
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="Why this term is approved or prohibited..."
              />
            </label>
            <div style={{ marginTop: 14 }}>
              <Button type="submit">Save term</Button>
            </div>
          </form>
        </Card>
      )}
      <div className="toolbar">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search terms and definitions..."
        />
        <FilterSelect
          value={tab}
          onChange={setTab}
          options={['All terms', 'Approved', 'Restricted']}
        />
      </div>
      {loading ? (
        <Card className="table-card">
          <p className="card-subtitle">Loading glossary…</p>
        </Card>
      ) : items.length > 0 ? (
        <div className="term-grid">
          {items.map((g) => (
            <Card className="term-card" key={g.id}>
              <div className="term-head">
                <b>{g.term}</b>
                <StatusPill status={g.type} />
              </div>
              <p>{g.definition}</p>
              {g.replacement && (
                <div className="replacement">
                  <span>Preferred alternative</span>
                  <b>{g.replacement}</b>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card className="table-card">
          <EmptyState
            title="No glossary entries yet"
            detail="Add approved or prohibited terminology for your brand."
          />
        </Card>
      )}
    </>
  );
}

export function Approvals() {
  const { submissions, updateStatus, refreshSubmissions, toast } = useApp();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const pending = submissions.filter((s) =>
    [
      'Submitted',
      'Queued',
      'Processing',
      'Completed',
      'Changes Requested',
    ].includes(s.status),
  );

  const decide = async (
    id: string,
    nextStatus: Status,
    backendDecision: 'approved' | 'rejected' | 'changes_requested',
  ) => {
    if (DEMO_MODE) {
      updateStatus(id, nextStatus);
      toast(`Submission marked ${nextStatus.toLowerCase()} in demo workspace.`);
      return;
    }

    setBusyId(id);
    try {
      await approvalsApi.decide({
        submissionId: id,
        decision: backendDecision,
        notes: notesById[id]?.trim() || undefined,
      });
      updateStatus(id, nextStatus);
      setNotesById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await refreshSubmissions();
      toast(`Decision recorded: ${nextStatus}.`);
    } catch (err) {
      toast(
        err instanceof Error ? err.message : 'Unable to record decision.',
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <DemoFlag />
      <PageHeader
        eyebrow="HUMAN-IN-THE-LOOP CONTROL"
        title="Approval center"
        subtitle="AI can advise. Your authorised reviewers make the decision."
      />
      <Card className="table-card">
        <div className="approval-queue">
          {pending.length ? (
            pending.map((s) => (
              <div className="approval-item" key={s.id}>
                <div className="approval-file">
                  <FileText size={20} />
                </div>
                <div className="approval-copy" style={{ flex: 1 }}>
                  <b>{s.campaign}</b>
                  <small>
                    {s.id.slice(0, 8)} · {s.platform} · {s.category}
                  </small>
                  <span>
                    Submitted {new Date(s.submittedAt).toLocaleString()}
                  </span>
                  {!DEMO_MODE && (
                    <input
                      type="text"
                      value={notesById[s.id] || ''}
                      onChange={(e) =>
                        setNotesById((prev) => ({
                          ...prev,
                          [s.id]: e.target.value,
                        }))
                      }
                      placeholder="Reviewer notes (optional)..."
                      aria-label={`Reviewer notes for ${s.campaign}`}
                      style={{
                        marginTop: 8,
                        width: '100%',
                        maxWidth: 360,
                        padding: '6px 10px',
                        borderRadius: 8,
                        border: '1px solid #e6d8cc',
                        fontSize: 13,
                      }}
                    />
                  )}
                </div>
                <StatusPill status={s.status} />
                <div className="approval-buttons">
                  <button
                    type="button"
                    title="Approve"
                    aria-label={`Approve ${s.campaign}`}
                    disabled={busyId === s.id}
                    onClick={() => void decide(s.id, 'Approved', 'approved')}
                  >
                    <Check size={17} />
                  </button>
                  <button
                    type="button"
                    title="Request changes"
                    aria-label={`Request changes for ${s.campaign}`}
                    disabled={busyId === s.id}
                    onClick={() =>
                      void decide(
                        s.id,
                        'Changes Requested',
                        'changes_requested',
                      )
                    }
                  >
                    <RefreshCw size={16} />
                  </button>
                  <button
                    type="button"
                    title="Reject"
                    aria-label={`Reject ${s.campaign}`}
                    disabled={busyId === s.id}
                    onClick={() => void decide(s.id, 'Rejected', 'rejected')}
                  >
                    <X size={17} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              title="Nothing waiting for approval"
              detail="New submissions will appear here when they enter the review workflow."
            />
          )}
        </div>
      </Card>
    </>
  );
}

export function Analytics() {
  const { submissions } = useApp();
  const [data, setData] = useState<BackendAnalytics | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (DEMO_MODE) return;
    setLoading(true);
    analyticsApi
      .dashboard()
      .then(setData)
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load dashboard analytics.',
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const approvalRate = useMemo(() => {
    if (!submissions.length) return '0%';
    const approved = submissions.filter((s) => s.status === 'Approved').length;
    return `${Math.round((approved / submissions.length) * 100)}%`;
  }, [submissions]);

  return (
    <>
      <DemoFlag />
      <PageHeader
        eyebrow="PERFORMANCE & GOVERNANCE"
        title="Analytics"
        subtitle="Understand review throughput, compliance trends and recurring issues."
      />
      {error && <div className="form-error">{error}</div>}
      <div className="stat-grid">
        <StatCard
          label="Approval rate"
          value={approvalRate}
          change={`${submissions.length} total submissions`}
          icon={CheckCircle2}
        />
        <StatCard
          label="Total approvals"
          value={loading ? '…' : data ? data.total_approvals : 0}
          change="Recorded decisions"
          icon={Clock3}
          tone="latte"
        />
        <StatCard
          label="Dispute rate"
          value={data ? `${Math.round(data.dispute_rate * 100)}%` : '0%'}
          change={
            data
              ? `Override rate ${Math.round(data.override_rate * 100)}%`
              : 'Live metric'
          }
          icon={AlertTriangle}
          tone="amber"
        />
        <StatCard
          label="Stale claims"
          value={data ? data.stale_claims_count : 0}
          change="Claims past expiry"
          icon={ShieldCheck}
          tone="green"
        />
      </div>

      <div className="dashboard-grid">
        <Card className="chart-card">
          <SectionTitle title="Violations by channel" />
          <p className="card-subtitle">Live issue counts per channel</p>
          {data && data.violations_by_channel.length > 0 ? (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.violations_by_channel}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#eee4da"
                  />
                  <XAxis dataKey="channel" axisLine={false} tickLine={false} />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    fill="#A47759"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="No channel violations recorded"
              detail="Channel metrics appear once reviews detect issues."
            />
          )}
        </Card>

        <Card className="chart-card">
          <SectionTitle title="Most violated rules" />
          <p className="card-subtitle">Top rule references in live issues</p>
          {data && data.most_violated_guidelines.length > 0 ? (
            <div className="mini-bars">
              {data.most_violated_guidelines.map((r) => (
                <div className="mini-bar" key={r.rule_ref}>
                  <span>{r.rule_ref}</span>
                  <div>
                    <i style={{ width: `${Math.min(r.count * 20, 100)}%` }} />
                  </div>
                  <b>{r.count}</b>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No rule violations yet"
              detail="Rule violation frequencies will populate from live issues."
            />
          )}
        </Card>
      </div>
    </>
  );
}

export function AuditLogs() {
  const [logs, setLogs] = useState<AuditEvent[]>(DEMO_MODE ? demoAudit : []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (DEMO_MODE) return;
    setLoading(true);
    auditApi
      .list()
      .then(setLogs)
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : 'Unable to load audit logs.',
        );
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="ACCOUNTABILITY"
        title="Audit logs"
        subtitle="A traceable record of actions across your brand workspace."
      />
      {error && <div className="form-error">{error}</div>}
      <Card className="table-card">
        {loading ? (
          <p className="card-subtitle">Loading audit logs…</p>
        ) : logs.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Timestamp</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="table-primary">{a.actor}</div>
                      <small>{a.id.slice(0, 8)}</small>
                    </td>
                    <td>{a.action}</td>
                    <td>{a.target}</td>
                    <td>{new Date(a.timestamp).toLocaleString()}</td>
                    <td>{a.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No audit events available"
            detail="Workspace events will appear here for authorised audit viewers."
          />
        )}
      </Card>
    </>
  );
}

export function Users() {
  const { toast } = useApp();
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<
    Array<{ id: string; name: string; email: string; role: string; state: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('creator');

  const load = useCallback(async () => {
    if (DEMO_MODE) return;
    setLoading(true);
    setError('');
    try {
      const rows = await usersApi.list();
      setPeople(
        rows.map((u) => ({
          id: u.id,
          name: u.full_name,
          email: u.email,
          role: (u.roles || ['creator']).join(', '),
          state: u.is_active ? 'Active' : 'Inactive',
        })),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load workspace users.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const tenantSlug = localStorage.getItem('bg_tenant_slug') || '';
    if (!tenantSlug) {
      toast('Workspace slug is missing. Please sign in again.');
      return;
    }
    try {
      await usersApi.create({
        tenantSlug,
        email: email.trim(),
        fullName: fullName.trim(),
        password,
        roles: [role],
      });
      setFullName('');
      setEmail('');
      setPassword('');
      setCreating(false);
      toast('User created.');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not create user.');
    }
  };

  const shown = people.filter((p) =>
    (p.name + p.email + p.role).toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      <DemoFlag />
      <PageHeader
        eyebrow="WORKSPACE ADMINISTRATION"
        title="User management"
        subtitle="Manage workspace membership and access roles."
        action={
          !DEMO_MODE ? (
            <Button
              variant="secondary"
              onClick={() => setCreating((v) => !v)}
            >
              <Plus size={16} /> {creating ? 'Close' : 'Add user'}
            </Button>
          ) : undefined
        }
      />
      {error && <div className="form-error">{error}</div>}
      {creating && (
        <Card className="form-card" style={{ marginBottom: 16 }}>
          <h2>Create workspace user</h2>
          <form onSubmit={handleCreate}>
            <div className="two-fields">
              <label className="field">
                <span>Full name *</span>
                <input
                  required
                  minLength={2}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Work email *</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            </div>
            <div className="two-fields">
              <label className="field">
                <span>Temporary password *</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Role *</span>
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="creator">creator</option>
                  <option value="brand_manager">brand_manager</option>
                  <option value="legal_reviewer">legal_reviewer</option>
                  <option value="brand_admin">brand_admin</option>
                </select>
              </label>
            </div>
            <div style={{ marginTop: 14 }}>
              <Button type="submit">Create user</Button>
            </div>
          </form>
        </Card>
      )}
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} />
      </div>
      <Card className="table-card">
        {loading ? (
          <p className="card-subtitle">Loading users…</p>
        ) : shown.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="table-primary">{p.name}</div>
                      <small>{p.email}</small>
                    </td>
                    <td>{p.role}</td>
                    <td>
                      <StatusPill status={p.state} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No users listed"
            detail="Only Brand Admins can view and manage workspace members."
          />
        )}
      </Card>
    </>
  );
}

export function Settings() {
  const [tab, setTab] = useState('Profile');
  const { user } = useApp();

  return (
    <>
      <PageHeader
        eyebrow="PREFERENCES & SECURITY"
        title="Settings"
        subtitle="Your authenticated workspace profile and session details."
      />
      <div className="settings-layout">
        <Card className="settings-nav">
          {['Profile', 'Workspace', 'Security'].map((x) => (
            <button
              className={tab === x ? 'selected' : ''}
              onClick={() => setTab(x)}
              key={x}
            >
              {x}
              <ArrowUpRight size={14} />
            </button>
          ))}
        </Card>
        <Card className="settings-content">
          <span className="eyebrow">{tab.toUpperCase()}</span>
          <h2>{tab} details</h2>
          {tab === 'Profile' ? (
            <>
              <div className="settings-profile">
                <div className="profile-avatar large">
                  {user?.name?.[0] || 'U'}
                </div>
                <div>
                  <b>{user?.name || 'Workspace user'}</b>
                  <p>{user?.email || '—'}</p>
                </div>
              </div>
              <label className="field">
                <span>Display name</span>
                <input value={user?.name || ''} readOnly />
              </label>
              <label className="field">
                <span>Email address</span>
                <input value={user?.email || ''} readOnly />
              </label>
              <label className="field">
                <span>Role</span>
                <input value={user?.role || 'Creator'} readOnly />
              </label>
            </>
          ) : tab === 'Workspace' ? (
            <>
              <label className="field">
                <span>Workspace name</span>
                <input value={user?.tenantName || '—'} readOnly />
              </label>
              <label className="field">
                <span>Workspace slug</span>
                <input
                  value={localStorage.getItem('bg_tenant_slug') || '—'}
                  readOnly
                />
              </label>
            </>
          ) : (
            <div className="settings-placeholder">
              <ShieldCheck size={24} />
              <b>JWT Bearer authentication active</b>
              <p>
                Access tokens automatically refresh via /api/v1/auth/refresh and
                revoke on logout via /api/v1/auth/logout.
              </p>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
