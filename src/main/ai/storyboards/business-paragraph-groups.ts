import { STORYBOARD_LIMITS } from '../../../shared/storyboards';

interface NativeFactRow {
  readonly id: string;
  readonly cells: readonly string[];
}
export interface BusinessParagraphGroup {
  readonly id: string;
  readonly rowIds: readonly string[];
}

/** Bounded presentation grouping only: every complete native row remains in authored order. */
export function businessParagraphGroups(rows: readonly NativeFactRow[]): BusinessParagraphGroup[] {
  const stride = Math.ceil(rows.length / STORYBOARD_LIMITS.maxItems);
  if (stride < 1) return [];
  const groups: BusinessParagraphGroup[] = [];
  for (let start = 0; start < rows.length; start += stride) {
    const members = rows.slice(start, start + stride);
    groups.push({
      id: `group:${members.map((row) => row.id).join('/')}`,
      rowIds: members.map((row) => row.id),
    });
  }
  return groups;
}
