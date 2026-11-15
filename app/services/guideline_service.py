from collections import defaultdict
from dataclasses import dataclass

from app.schemas.contracts import BrandGuidelineContext, BrandGuidelineRule, ContentInput


@dataclass
class InterpretedGuidelines:
    """Organized, conflict-checked brand rules ready for prompt injection."""

    by_category: dict[str, list[BrandGuidelineRule]]
    mandatory_rules: list[BrandGuidelineRule]
    recommended_rules: list[BrandGuidelineRule]
    known_rule_ids: set[str]
    conflicts: list[str]
    uncertainty_notes: list[str]


def interpret_guidelines(
    guidelines: BrandGuidelineContext,
    content: ContentInput,
) -> InterpretedGuidelines:
    """Categorize, filter by channel, detect conflicts, and flag missing guideline coverage."""
    relevant: list[BrandGuidelineRule] = []
    for rule in guidelines.rules:
        if rule.channel_scope and rule.channel_scope.lower() not in {"all", "general", content.channel.lower()}:
            continue
        relevant.append(rule)

    by_category: dict[str, list[BrandGuidelineRule]] = defaultdict(list)
    mandatory_rules: list[BrandGuidelineRule] = []
    recommended_rules: list[BrandGuidelineRule] = []
    known_ids: set[str] = set()

    for rule in relevant:
        cat = rule.category.lower().strip()
        by_category[cat].append(rule)
        known_ids.add(rule.rule_id)
        if rule.mandatory:
            mandatory_rules.append(rule)
        else:
            recommended_rules.append(rule)

    conflicts = _detect_rule_conflicts(by_category)
    uncertainty_notes: list[str] = []
    if not relevant:
        uncertainty_notes.append(
            "No active brand guidelines provided for this channel; findings require human review."
        )

    return InterpretedGuidelines(
        by_category=dict(by_category),
        mandatory_rules=mandatory_rules,
        recommended_rules=recommended_rules,
        known_rule_ids=known_ids,
        conflicts=conflicts,
        uncertainty_notes=uncertainty_notes,
    )


def _detect_rule_conflicts(by_category: dict[str, list[BrandGuidelineRule]]) -> list[str]:
    """Detect simple contradictory mandatory/recommended rules within the same category."""
    conflicts: list[str] = []
    positive_markers = ("always", "must use", "require")
    negative_markers = ("never", "must not", "prohibit", "avoid")

    for category, rules in by_category.items():
        pos = [r for r in rules if any(m in r.description.lower() for m in positive_markers)]
        neg = [r for r in rules if any(m in r.description.lower() for m in negative_markers)]
        if len(pos) > 0 and len(neg) > 0:
            for p in pos:
                for n in neg:
                    p_words = set(p.title.lower().split())
                    n_words = set(n.title.lower().split())
                    overlap = (p_words & n_words) - {"the", "and", "for", "with", "use", "in"}
                    if overlap:
                        conflicts.append(
                            f"Potential conflict in '{category}' between {p.rule_id} and {n.rule_id} on {sorted(overlap)}"
                        )
    return conflicts


def format_rules_for_prompt(
    guidelines: InterpretedGuidelines,
    categories: list[str] | None = None,
) -> str:
    """Format relevant mandatory and recommended rules into a grounded prompt block."""
    selected: list[BrandGuidelineRule] = []
    if categories:
        for cat in categories:
            selected.extend(guidelines.by_category.get(cat.lower(), []))
    else:
        selected = guidelines.mandatory_rules + guidelines.recommended_rules

    if not selected:
        return "NO_MATCHING_GUIDELINES_PROVIDED"

    lines: list[str] = []
    for r in selected:
        level = "MANDATORY" if r.mandatory else "RECOMMENDATION"
        lines.append(
            f"- [{r.rule_id}] ({level} | category={r.category} | severity={r.severity}) "
            f"{r.title}: {r.description}"
        )
    return "\n".join(lines)

