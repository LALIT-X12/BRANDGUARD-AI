import difflib


def compute_text_diff(original: str, updated: str) -> dict[str, object]:
    """Compute a unified diff and change summary between two content versions."""
    orig_lines = original.splitlines()
    upd_lines = updated.splitlines()
    diff_lines = list(
        difflib.unified_diff(orig_lines, upd_lines, fromfile="original", tofile="updated", lineterm="")
    )
    return {
        "has_changes": original != updated,
        "unified_diff": "\n".join(diff_lines),
        "line_delta": len(upd_lines) - len(orig_lines),
    }

