export interface DiffToken {
  type: 'equal' | 'add' | 'del';
  value: string;
}

export interface DiffSummary {
  tokens: DiffToken[];
  addedWords: number;
  removedWords: number;
  unchangedWords: number;
  changePercent: number;
}

function tokenizeWords(text: string): string[] {
  if (!text) return [];
  return text.match(/\S+|\s+/g) || [];
}

/**
 * Lightweight Longest Common Subsequence (LCS) word-level diff engine.
 * Preserves whitespace tokens so inline and split views render exact prose faithfully.
 */
export function computeWordDiff(original: string, revised: string): DiffSummary {
  const a = tokenizeWords(original);
  const b = tokenizeWords(revised);

  const m = a.length;
  const n = b.length;

  // Guard extreme inputs (> 1,500 tokens) with line-level fallback for instant UI responsiveness
  if (m * n > 1_200_000) {
    const fallbackTokens: DiffToken[] = [];
    if (original) fallbackTokens.push({ type: 'del', value: original });
    if (revised) fallbackTokens.push({ type: 'add', value: revised });
    const aCount = a.filter((t) => /\S/.test(t)).length;
    const bCount = b.filter((t) => /\S/.test(t)).length;
    return {
      tokens: fallbackTokens,
      addedWords: bCount,
      removedWords: aCount,
      unchangedWords: 0,
      changePercent: original === revised ? 0 : 100,
    };
  }

  const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
      }
    }
  }

  const raw: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      raw.push({ type: 'equal', value: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ type: 'del', value: a[i] });
      i += 1;
    } else {
      raw.push({ type: 'add', value: b[j] });
      j += 1;
    }
  }
  while (i < m) {
    raw.push({ type: 'del', value: a[i] });
    i += 1;
  }
  while (j < n) {
    raw.push({ type: 'add', value: b[j] });
    j += 1;
  }

  // Coalesce adjacent tokens of the same type
  const tokens: DiffToken[] = [];
  for (const tok of raw) {
    const prev = tokens[tokens.length - 1];
    if (prev && prev.type === tok.type) {
      prev.value += tok.value;
    } else {
      tokens.push({ ...tok });
    }
  }

  let addedWords = 0;
  let removedWords = 0;
  let unchangedWords = 0;
  for (const tok of raw) {
    if (!/\S/.test(tok.value)) continue;
    if (tok.type === 'add') addedWords += 1;
    else if (tok.type === 'del') removedWords += 1;
    else unchangedWords += 1;
  }

  const denom = Math.max(1, unchangedWords + addedWords + removedWords);
  const changePercent = Math.round(((addedWords + removedWords) / denom) * 100);

  return {
    tokens,
    addedWords,
    removedWords,
    unchangedWords,
    changePercent,
  };
}
