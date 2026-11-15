from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi.testclient import TestClient

from app.clients.claude_client import TokenUsage
from app.main import app, get_claude_client, get_mongo_store


class _StubMongoStore:
    async def ping(self) -> bool:
        return True


class FakeClaudeClient:
    """Deterministic test double for ClaudeClient without external network calls."""

    class _Settings:
        CLAUDE_MODEL = "fake-claude"
        CLAUDE_VALIDATOR_MODEL = "fake-claude-validator"
        INPUT_TOKEN_COST_PER_1M = 3.0
        OUTPUT_TOKEN_COST_PER_1M = 15.0

    settings = _Settings()

    async def complete_json(
        self,
        *,
        system_prompt: str,
        user_content: str | list[dict[str, Any]],
        response_model: type,
        model: str | None = None,
        request_id: str | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
    ):
        usage = TokenUsage(input_tokens=100, output_tokens=50, calls=1)

        if "Claim Verification" in system_prompt:
            payload = {
                "assessments": [
                    {
                        "submitted_claim": "improves productivity by 75%",
                        "status": "verified",
                        "confidence": 0.9,
                        "matched_claim_code": "CLM-OLD",
                        "evidence_summary": "Matches old claim but claim is expired.",
                        "requires_human_review": False,
                    }
                ]
            }
            return response_model.model_validate(payload), usage

        if "Minimal-Edit Fix Generator" in system_prompt:
            payload = {
                "proposed_content": "Explore the offer today.",
                "explanation": "Softened aggressive CTA.",
                "preserved_intent": True,
            }
            return response_model.model_validate(payload), usage

        if "INDEPENDENT Fix Validator" in system_prompt:
            payload = {
                "status": "pass",
                "issue_fixed": True,
                "intent_preserved": True,
                "no_new_claims": True,
                "no_new_violations": True,
                "feedback": None,
                "evidence": "Aggressive urgency removed while keeping offer intent.",
            }
            return response_model.model_validate(payload), usage

        payload = {
            "findings": [
                {
                    "category": "tone",
                    "severity": "medium",
                    "confidence": 0.94,
                    "issue": "Overly aggressive wording.",
                    "evidence": {
                        "text": "Buy now or miss your only chance!",
                        "start": 0,
                        "end": 33,
                    },
                    "guideline_reference": "TONE-004",
                    "explanation": "Conflicts with friendly tone.",
                    "suggested_fix": "Explore the offer today.",
                    "checker_name": "tone_reviewer",
                    "requires_human_review": False,
                }
            ],
            "uncertainty_notes": [],
        }
        return response_model.model_validate(payload), usage


def test_ai_service_endpoints_and_expired_claim_escalation() -> None:
    app.dependency_overrides[get_claude_client] = lambda: FakeClaudeClient()
    app.dependency_overrides[get_mongo_store] = lambda: _StubMongoStore()
    try:
        with TestClient(app) as client:
            health = client.get("/health")
            assert health.status_code == 200

            expired_at = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
            review_resp = client.post(
                "/review",
                json={
                    "request_id": "req-123",
                    "content": {
                        "text": "Buy now or miss your only chance! Our tool improves productivity by 75%.",
                        "channel": "email",
                        "audience": "enterprise",
                        "intent": "promote offer",
                    },
                    "guidelines": {
                        "guideline_id": "gl-1",
                        "version": "1.0",
                        "rules": [
                            {
                                "rule_id": "TONE-004",
                                "category": "tone",
                                "severity": "medium",
                                "mandatory": True,
                                "title": "Friendly Tone",
                                "description": "Use welcoming CTAs.",
                            }
                        ],
                    },
                    "claims": [
                        {
                            "claim_code": "CLM-OLD",
                            "statement": "Improves productivity by 75%",
                            "expires_at": expired_at,
                            "is_active": True,
                        }
                    ],
                    "enabled_checkers": ["tone"],
                },
            )
            assert review_resp.status_code == 200
            body = review_resp.json()
            assert body["request_id"] == "req-123"
            # Expired claim must be escalated deterministically even if LLM said verified
            assert body["data"]["requires_human_review"] is True
            assert any(f["guideline_reference"] == "CLM-OLD" for f in body["data"]["findings"])

            fix_resp = client.post(
                "/fixes/generate",
                json={
                    "issue": {"id": "1", "category": "tone", "evidence": "Buy now!"},
                    "content": "Buy now or miss your only chance!",
                    "intent": "promote offer",
                },
            )
            assert fix_resp.status_code == 200
            assert fix_resp.json()["proposed_content"] == "Explore the offer today."

            val_resp = client.post(
                "/fixes/validate",
                json={
                    "original_content": "Buy now or miss your only chance!",
                    "proposed_content": "Explore the offer today.",
                    "intent": "promote offer",
                    "issue_evidence": "Buy now or miss your only chance!",
                    "rule_ref": "TONE-004",
                },
            )
            assert val_resp.status_code == 200
            assert val_resp.json()["status"] == "pass"
            assert val_resp.json()["issue_fixed"] is True

            # Invalid service token rejected
            bad_auth = client.post(
                "/analyze",
                headers={"X-Service-Token": "wrong-token"},
                json={"content": {"text": "Hello"}},
            )
            assert bad_auth.status_code == 401
    finally:
        app.dependency_overrides.clear()

