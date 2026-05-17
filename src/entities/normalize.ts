/**
 * SPEC-046 R3 normalization rule: NFKC → lowercase → trim → collapse internal whitespace.
 * Applied identically to user input (recall), entity normalized_name writes, and alias compares.
 */
export function normalizeEntityName(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
