import asyncio
import json
import time

from app.clients.claude_client import ClaudeClient
from app.clients.mongo_client import MongoDatasetStore
from app.evaluation.evaluator import EvalSampleResult, compute_evaluation_metrics
from app.pipelines.review_pipeline import run_review_pipeline
from app.schemas.contracts import (
    BrandGuidelineContext,
    BrandGuidelineRule,
    ClaimEvidence,
    ContentInput,
    ReviewRequest,
)


async def main() -> None:
    store = MongoDatasetStore()
    if not await store.ping():
        raise RuntimeError("MongoDB is unreachable. Start MongoDB and seed datasets first.")

    raw_guidelines = await store.list_guidelines()
    raw_claims = await store.list_claims()
    cases = await store.list_eval_cases()
    if not cases:
        raise RuntimeError("No evaluation cases found in MongoDB. Run scripts/seed_mongo.py first.")

    guidelines = BrandGuidelineContext(
        guideline_id="mongo-active",
        version="1.0",
        rules=[BrandGuidelineRule.model_validate(r) for r in raw_guidelines],
    )
    claims = [ClaimEvidence.model_validate(c) for c in raw_claims]
    client = ClaudeClient()

    results: list[EvalSampleResult] = []
    for case in cases:
        start = time.perf_counter()
        req = ReviewRequest(
            request_id=case["case_id"],
            content=ContentInput(
                text=case["text"],
                channel=case["channel"],
                audience=case["audience"],
                intent=case["intent"],
            ),
            guidelines=guidelines,
            claims=claims,
        )
        resp = await run_review_pipeline(client=client, request=req)
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        results.append(
            EvalSampleResult(
                sample_id=case["case_id"],
                expected_issue=bool(case["expected_issue"]),
                predicted_issue=len(resp.findings) > 0,
                latency_ms=elapsed_ms,
                estimated_cost_usd=resp.token_usage.estimated_cost_usd,
            )
        )

    metrics = compute_evaluation_metrics(results)
    await store.record_eval_run({"sample_count": len(results), "metrics": metrics})
    await store.close()
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
