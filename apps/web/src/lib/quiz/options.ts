function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeOptionText(raw: string): string {
  const base = compactText(String(raw || ''));
  if (!base) return '';

  const labeled = base.match(/^(?:선택지|보기|옵션|option)\s*[0-9A-Da-d]+(?:\s*[:.)-]\s*|\s+)(.+)$/i);
  if (labeled?.[1]) return compactText(labeled[1]);

  const numbered = base.match(/^\s*(?:\(?[1-9]\)?[.)-]|[A-Da-d][.)-])\s*(.+)$/);
  if (numbered?.[1]) return compactText(numbered[1]);

  return base;
}

export function isPlaceholderOption(raw: string): boolean {
  const text = compactText(raw).toLowerCase();
  if (!text) return true;
  if (/^\d+$/.test(text)) return true;
  if (/^[a-d]$/.test(text)) return true;
  if (/^\d+\s*번$/.test(text)) return true;
  if (/^(?:선택지|보기|옵션|option)\s*[0-9a-d]+$/i.test(text)) return true;
  return false;
}

function extractEnumeratedOptions(...sources: Array<string | undefined | null>): string[] {
  const extracted: string[] = [];
  for (const source of sources) {
    const text = String(source || '');
    if (!text.trim()) continue;

    for (const line of text.split('\n')) {
      const match = line.match(/^\s*(?:\(?[1-9]\)?[.)]|[A-Da-d][.)])\s*(.+?)\s*$/);
      if (!match?.[1]) continue;

      const candidate = normalizeOptionText(match[1]);
      if (!candidate || isPlaceholderOption(candidate)) continue;
      if (!extracted.includes(candidate)) extracted.push(candidate);
      if (extracted.length >= 10) return extracted;
    }
  }
  return extracted;
}

// Keep option indexes stable for scoring, and only normalize display labels.
export function sanitizeQuizOptions(
  rawOptions: unknown,
  ...sources: Array<string | undefined | null>
): string[] {
  const options = Array.isArray(rawOptions)
    ? rawOptions.map((value) => String(value ?? ''))
    : [];

  if (options.length === 0) {
    const extracted = extractEnumeratedOptions(...sources);
    if (extracted.length > 0) return extracted.slice(0, 4);
    return ['선택지 1', '선택지 2', '선택지 3', '선택지 4'];
  }

  const extracted = extractEnumeratedOptions(...sources);
  let extractedIndex = 0;

  return options.map((raw, index) => {
    const normalized = normalizeOptionText(raw);
    if (normalized && !isPlaceholderOption(normalized)) {
      return normalized;
    }

    while (extractedIndex < extracted.length) {
      const candidate = extracted[extractedIndex++];
      if (candidate && !isPlaceholderOption(candidate)) {
        return candidate;
      }
    }

    return `선택지 ${index + 1}`;
  });
}
