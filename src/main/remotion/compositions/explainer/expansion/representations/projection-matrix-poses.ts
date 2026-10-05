import { diagramPose } from '../../diagrams/motion';
import { plottedValueText } from '../kits/plots';
import type { ExpansionKitPose } from '../scene-types';
import type { ExpansionBasis, ExpansionRational } from '../value-types';
import type {
  ExpansionProjectionMatrixScene,
  MatrixQualification,
} from './projection-matrix-types';

export interface ProjectionMatrixPage {
  id: string;
  lines: string[];
  /** Stable source IDs are trace metadata, not prose repeated on every cell. */
  sourceIds: string[];
  matrixId?: string;
  rowId?: string;
  correspondenceId?: string;
}
export interface ProjectionMatrixPose extends ExpansionKitPose {
  page: number;
  pages: ProjectionMatrixPage[];
}
export const SOURCE_COLUMNS = 18;
export const SOURCE_LINES = 14;
export function wrapSource(value: string, columns = SOURCE_COLUMNS): string[] {
  const chars = Array.from(value);
  return Array.from({ length: Math.max(1, Math.ceil(chars.length / columns)) }, (_, i) =>
    chars.slice(i * columns, (i + 1) * columns).join(''),
  );
}
export function exactText(value: ExpansionRational): string {
  return value.denominator === 1 ? `${value.numerator}` : `${value.numerator}/${value.denominator}`;
}
export function qualificationText(q: MatrixQualification): string {
  return `${q.state}${'condition' in q ? `: ${q.condition}` : 'qualifier' in q ? `: ${q.qualifier}` : ''}`;
}
function basisFields(b: ExpansionBasis): string[] {
  return [
    `Unit: ${b.unit}`,
    `Period: ${b.period}`,
    `Population: ${b.population}`,
    ...(b.denominator ? [`Reference denominator: ${exactText(b.denominator)}`] : []),
  ];
}
/** Canonical source dictionaries + numeric rows, not a transcript of internal IDs/calculated terms. */
export function projectionMatrixPages(
  scene: ExpansionProjectionMatrixScene,
): ProjectionMatrixPage[] {
  const pages: ProjectionMatrixPage[] = [];
  const add = (
    id: string,
    fields: string[],
    sourceIds: string[] = [id],
    view: Pick<ProjectionMatrixPage, 'matrixId' | 'rowId' | 'correspondenceId'> = {},
  ) => {
    const lines = fields.flatMap((f) => wrapSource(f));
    for (let i = 0; i < lines.length; i += SOURCE_LINES)
      pages.push({
        id,
        lines: lines.slice(i, i + SOURCE_LINES),
        sourceIds: [...sourceIds],
        ...view,
      });
  };
  add(scene.storyId, [
    scene.label,
    scene.subject,
    scene.outcome,
    scene.evidence,
    scene.template,
    ...(scene.condition ? [scene.condition] : []),
  ]);
  const actor = new Map(scene.entities.map((e, i) => [e.id, `Actor ${i + 1}`]));
  add(
    'actors',
    scene.entities.flatMap((e) => [`${actor.get(e.id)}: ${e.label}`]),
    scene.entities.map((e) => e.id),
  );
  const dictionaries: { id: string; fields: string[]; sourceIds: string[] }[] = [];
  const intern = (prefix: string, values: string[], sourceId: string): string => {
    let entry = dictionaries.find(
      (d) =>
        d.id.startsWith(prefix) && JSON.stringify(d.fields.slice(1)) === JSON.stringify(values),
    );
    if (!entry) {
      entry = {
        id: `${prefix} ${dictionaries.filter((d) => d.id.startsWith(prefix)).length + 1}`,
        fields: [],
        sourceIds: [],
      };
      entry.fields = [entry.id, ...values];
      dictionaries.push(entry);
    }
    if (!entry.sourceIds.includes(sourceId)) entry.sourceIds.push(sourceId);
    return entry.id;
  };
  if (scene.storyId === '53') {
    const frame = new Map(scene.frames.map((f, i) => [f.id, `Frame ${i + 1}`]));
    add(
      'frames',
      scene.frames.flatMap((f) => [
        `${frame.get(f.id)}: ${f.label}`,
        ...f.axes.map((axis) => `${axis.axis} positive ${axis.positive}`),
      ]),
      scene.frames.map((f) => f.id),
    );
    for (const r of scene.records) {
      const q = r.quantity;
      const basis = intern('Basis', basisFields(q.basis), r.id);
      const qualification = intern('Status', [qualificationText(q)], r.id);
      const pair = scene.relations.find(
        (p) =>
          (p.fromActorId === r.actorId && p.fromFrameId === r.frameId) ||
          (p.toActorId === r.actorId && p.toFrameId === r.frameId),
      );
      add(
        r.id,
        [
          `${actor.get(r.actorId)} / ${frame.get(r.frameId)}`,
          q.claim,
          `Axis: ${r.axis}`,
          plottedValueText(q),
          basis,
          qualification,
          'Only supplied axes',
        ],
        [r.id],
        { correspondenceId: pair?.id },
      );
    }
    for (const r of scene.relations) {
      const status = intern('Status', [qualificationText(r)], r.id);
      add(
        r.id,
        [
          `${actor.get(r.fromActorId)} / ${frame.get(r.fromFrameId)}`,
          'corresponds to',
          `${actor.get(r.toActorId)} / ${frame.get(r.toFrameId)}`,
          status,
          'Supplied correspondence; not a calculation',
        ],
        [r.id],
        { correspondenceId: r.id },
      );
    }
  } else {
    const names = new Map(scene.records.map((m, i) => [m.id, `Matrix ${i + 1}`]));
    for (const m of scene.records) {
      const basis = intern('Basis', basisFields(m.basis), m.id);
      const claim = intern('Claim', [m.claim], m.id);
      const status = intern('Status', [qualificationText(m)], m.id);
      const rowNames = m.rows.map((r) => intern('Axis', [r.label], r.id));
      const columnNames = m.columns.map((c) => intern('Axis', [c.label], c.id));
      add(
        m.id,
        [
          names.get(m.id) ?? '',
          m.label,
          actor.get(m.actorId) ?? '',
          claim,
          basis,
          status,
          'Source operand',
        ],
        [m.id],
        { matrixId: m.id },
      );
      for (const [i, row] of m.rows.entries()) {
        const cells = m.cells.filter((c) => c.rowId === row.id);
        // Current row's exact source values are in the left numeric table. Source
        // column/row names link to canonical axis labels, not inferred geometry.
        add(
          row.id,
          [
            names.get(m.id) ?? '',
            `Row ${i + 1}: ${rowNames[i]}`,
            ...columnNames.map((name, j) => `C${j + 1}: ${name}`),
            basis,
            status,
            ...(cells.length ? [] : ['No cells supplied']),
          ],
          [m.id, row.id, ...m.columns.map((c) => c.id), ...cells.map((c) => c.id)],
          { matrixId: m.id, rowId: row.id },
        );
      }
    }
    for (const [i, request] of scene.relations.entries()) {
      const product = scene.products.find((p) => p.requestId === request.id);
      if (!product) throw new Error('Validated product request lost its product');
      const status = intern('Status', [qualificationText(product.qualification)], product.id);
      add(
        request.id,
        [
          `Product ${i + 1}`,
          actor.get(request.actorId) ?? '',
          `${names.get(request.leftId)} times ${names.get(request.rightId)}`,
          request.operation,
          status,
          product.state,
          ...(product.state === 'unavailable' ? [product.reason] : ['Allowed exact result']),
        ],
        [request.id, product.id],
        { matrixId: product.id },
      );
      if (product.state === 'derived')
        for (const [rowIndex, row] of product.rows.entries()) {
          const cells = product.cells.filter((c) => c.rowId === row.id);
          add(
            `${product.id}:${row.id}`,
            [
              `Product ${i + 1}`,
              `Row ${rowIndex + 1} from ${names.get(request.leftId)}`,
              `Columns from ${names.get(request.rightId)}`,
              'matrix-product',
              status,
              intern('Basis', basisFields(cells[0].basis), product.id),
              'Exact derived cells',
            ],
            [product.id, row.id, ...cells.map((c) => c.id)],
            { matrixId: product.id, rowId: row.id },
          );
        }
    }
  }
  // Dictionaries precede referring pages. Preserve all exact labels/conditions once,
  // including canonical matches shared by multiple source assertions.
  const facts = pages.splice(2);
  for (const d of dictionaries) add(d.id, d.fields, d.sourceIds);
  pages.push(...facts);
  return pages;
}
/** Five-beat seekable motion depends on time, not represented quantities. */
export function projectionMatrixPose(
  scene: ExpansionProjectionMatrixScene,
  time: number,
  pages = projectionMatrixPages(scene),
): ProjectionMatrixPose {
  const t = Number.isFinite(time) ? time : scene.setupAt;
  const p = diagramPose(t, scene);
  const progress = Math.max(
    0,
    Math.min(1, (t - scene.setupAt) / Math.max(0.001, scene.resolveAt - scene.setupAt)),
  );
  return {
    reveal: p.setup,
    action: p.action,
    response: p.response,
    check: p.check,
    resolve: p.resolve,
    pages,
    page: Math.min(pages.length - 1, Math.floor(progress * pages.length)),
  };
}
