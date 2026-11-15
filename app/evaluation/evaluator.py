from dataclasses import dataclass


@dataclass
class EvalSampleResult:
    sample_id: str
    expected_issue: bool
    predicted_issue: bool
    latency_ms: float
    estimated_cost_usd: float


def compute_evaluation_metrics(results: list[EvalSampleResult]) -> dict[str, float]:
    """Compute precision, recall, F1, false-positive rate, latency, and cost."""
    tp = sum(1 for r in results if r.expected_issue and r.predicted_issue)
    fp = sum(1 for r in results if not r.expected_issue and r.predicted_issue)
    fn = sum(1 for r in results if r.expected_issue and not r.predicted_issue)
    tn = sum(1 for r in results if not r.expected_issue and not r.predicted_issue)

    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
    fpr = fp / (fp + tn) if (fp + tn) else 0.0
    avg_latency_ms = sum(r.latency_ms for r in results) / len(results) if results else 0.0
    total_cost = sum(r.estimated_cost_usd for r in results)

    return {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1_score": round(f1, 4),
        "false_positive_rate": round(fpr, 4),
        "avg_latency_ms": round(avg_latency_ms, 2),
        "total_cost_usd": round(total_cost, 6),
    }

