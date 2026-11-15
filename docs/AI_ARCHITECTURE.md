# BrandGuard AI Integration Architecture (Phase 0)

## 1. Purpose & Boundary
`brandguard-ai` is an **independent AI integration service** that communicates with `brandguard-backend` over a versioned JSON HTTP contract.
- **No direct content approval**: AI findings and fix proposals are advisory only; final approval belongs exclusively to authorised human reviewers in `brandguard-backend`.
- **Single Claude Client**: All Anthropic Claude API calls go through `app/clients/claude_client.py`. Services and checkers never instantiate SDK clients directly.
- **Evidence-First & Conservative Abstention**: AI must never invent brand rules or claims. When guidelines or evidence are missing or ambiguous, it flags uncertainty and escalates to human review.

## 2. Responsibility Matrix: AI Integration vs. Deterministic Engine

| Capability | AI Integration (`brandguard-ai`) | Deterministic Review Engine |
|---|---|---|
| Terminology & Glossary | Contextual semantic misuse | Regex terminology checks & exact glossary matching |
| Brand Voice & Tone | Tone, voice personality, contextual messaging | Text statistics (word/sentence counts, readability) |
| Claim Assessment | Semantic claim comparison against approved registry | Source expiry date checks & exact claim code lookup |
| Visual Review | Brand identity consistency, misleading visuals, image-text mismatch | Mathematical contrast ratios, image dimensions, exact asset hashes |
| Fix Generation | Minimal-edit correction preserving creator intent | Diff computation & structural length bounds |
| Fix Validation | Independent semantic validation (intent, new claims, violations) | Deterministic rule re-checks (prohibited terms, regex) |

## 3. Inputs & Outputs
- **Inputs from Backend**: `ReviewRequest` (content, channel, audience, intent, sensitivity, active `BrandGuidelineContext`, `GlossaryContext`, `ClaimEvidence[]`), `FixRequest`, `ValidationRequest`, and `VisualAnalysisRequest`.
- **Outputs to Backend**: Standard `ResponseEnvelope` wrapping `ReviewResponse` (normalized `ReviewFinding[]` with validated character offsets & `guideline_reference`), `FixResponse`, `ValidationResponse`, or `VisualAnalysisResponse`.

## 4. Error Handling, Retries & Fallbacks
- Transient Anthropic API errors (`RateLimitError`, `APIConnectionError`, timeouts) are retried with bounded exponential backoff (`tenacity`).
- Malformed or non-JSON Claude responses are rejected via strict Pydantic validation and safely fall back to `requires_human_review=True` rather than returning unvalidated findings or fixes.
- Fix validation permits **at most 2 correction retries**; failure after 2 attempts triggers `human_review_required`.

## 5. AI Permissions & Limitations
- Untrusted creator text is isolated inside XML delimiters (`<untrusted_content>...</untrusted_content>`) to mitigate prompt injection.
- Backend masks PII before calling `brandguard-ai`; `brandguard-ai` operates statelessly and does not persist tenant data across requests.
- `brandguard-ai` has zero write access to PostgreSQL, Redis, or S3/MinIO; authorised image retrieval uses short-lived backend-issued references or pre-signed URLs.

