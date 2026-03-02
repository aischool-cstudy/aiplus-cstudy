export function clampScore(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function normalizeConceptTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .slice(0, 80);
}

export function extractConceptTags(input: {
  itemTitle?: string | null;
  difficultConcepts?: string[];
}): string[] {
  const source = [
    input.itemTitle || '',
    ...(input.difficultConcepts || []),
  ];

  return Array.from(
    new Set(
      source
        .map((value) => normalizeConceptTag(value))
        .filter(Boolean)
    )
  ).slice(0, 10);
}
