/** Structural projection of complete authored reading cards; never parses money or basis values. */
export interface FinancialReadingCard {
  readonly id: string;
  readonly title: string;
  readonly lines: readonly (string | { readonly text: string })[];
}
interface LineReference {
  readonly note?: number;
  readonly column?: number;
  readonly offset?: number;
  readonly length?: number;
  readonly prefix?: string;
}
export interface FinancialTableProjection {
  headings: string[];
  rows: { id: string; cells: string[] }[];
  notes: string[];
  /** Generated locations only, not a second store of facts. Offsets preserve embedded newlines. */
  readonly reconstruction: readonly (readonly LineReference[])[];
}
const SEPARATOR = ' · ';
const FIELD_NAMES = [
  'State',
  'Subject',
  'Activity',
  'Playbook',
  'Unit',
  'Population',
  'Period',
  'Denominator',
  'Version',
  'Date',
  'Basis',
  'Claim holder',
  'Transfer state',
  'Liquidity state',
  'Priority',
] as const;
function field(line: string): string | undefined {
  return FIELD_NAMES.find((name) => line.startsWith(`${name}: `));
}
export function projectFinancialReadingCards(
  cards: readonly FinancialReadingCard[],
): FinancialTableProjection {
  const texts = cards.map((card) =>
    card.lines.map((line) => (typeof line === 'string' ? line : line.text)),
  );
  const eligible = FIELD_NAMES.filter(
    (name) =>
      texts.length > 0 &&
      texts.every((lines) => lines.filter((line) => field(line) === name).length === 1),
  );
  const common: string[] = eligible.filter((name) =>
    texts.every(
      (lines) =>
        lines.find((line) => field(line) === name) ===
        texts[0].find((line) => field(line) === name),
    ),
  );
  const varying = eligible.filter((name) => !common.includes(name));
  const state = varying.filter((name) => name === 'State');
  const basis = varying.filter((name) => name !== 'State');
  const groups = [state, basis].filter((group) => group.length > 0);
  const headings = ['Field', 'Reading', ...groups.map((group) => group.join(SEPARATOR))];
  const notes = common.map((name) => texts[0].find((line) => field(line) === name) ?? '');
  const reconstruction: (readonly LineReference[])[] = [];
  let hasReadingPlaceholder = false;
  const rows = cards.map((card, rowIndex) => {
    const cells = [card.title, '', ...groups.map(() => '')];
    const references: LineReference[] = [];
    const append = (column: number, value: string, prefix = ''): LineReference => {
      const offset = cells[column].length + (cells[column] ? SEPARATOR.length : 0);
      cells[column] += `${cells[column] ? SEPARATOR : ''}${value}`;
      return Object.freeze({ column, offset, length: value.length, prefix });
    };
    // Ordered column values correspond exactly to the ordered, unabbreviated header names.
    for (const [groupIndex, group] of groups.entries()) {
      for (const name of group) {
        const index = texts[rowIndex].findIndex((line) => field(line) === name);
        const prefix = `${name}: `;
        references[index] = append(
          groupIndex + 2,
          texts[rowIndex][index].slice(prefix.length),
          prefix,
        );
      }
    }
    texts[rowIndex].forEach((line, index) => {
      if (references[index]) return;
      const note = common.indexOf(field(line) ?? '');
      references[index] = note >= 0 ? Object.freeze({ note }) : append(1, line);
    });
    reconstruction.push(Object.freeze(references));
    if (!cells[1]) {
      cells[1] = '—';
      hasReadingPlaceholder = true;
    }
    return { id: card.id, cells };
  });
  if (hasReadingPlaceholder) headings[1] = 'Reading (—: no separate reading text)';
  return { headings, rows, notes, reconstruction: Object.freeze(reconstruction) };
}
/** Reconstructs original titles and line bytes from visible text plus generated locations. */
export function reconstructFinancialReadingCards(
  table: FinancialTableProjection,
): { id: string; title: string; lines: string[] }[] {
  return table.rows.map((row, index) => ({
    id: row.id,
    title: row.cells[0],
    lines: table.reconstruction[index].map((ref) =>
      ref.note !== undefined
        ? table.notes[ref.note]
        : `${ref.prefix ?? ''}${row.cells[ref.column ?? 1].slice(ref.offset, (ref.offset ?? 0) + (ref.length ?? 0))}`,
    ),
  }));
}
