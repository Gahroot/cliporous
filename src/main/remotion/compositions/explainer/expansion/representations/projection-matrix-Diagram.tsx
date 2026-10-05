import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import { exactText, type ProjectionMatrixPose, wrapSource } from './projection-matrix-poses';
import type { ExpansionProjectionMatrixScene } from './projection-matrix-types';

function sourceLines(lines: readonly string[], sourceId: string): { id: string; text: string }[] {
  return lines.map((text, row) => ({ id: `${sourceId}:line:${row}`, text }));
}

/** Fixed authored paired stations, or one exact matrix row. Paging never invents a cell. */
export function ProjectionMatrixDiagram({
  scene,
  pose,
}: {
  scene: ExpansionProjectionMatrixScene;
  pose: ProjectionMatrixPose;
}): ReactElement {
  const S = useStage();
  const page = pose.pages[pose.page];
  const text = (value: string, x: number, y: number): ReactElement => (
    <text x={x} y={y} fontSize={22} fontFamily={UI_FONT} fill={S.text}>
      {value}
    </text>
  );
  const wrapped = (value: string, x: number, y: number, columns: number): ReactElement[] =>
    sourceLines(wrapSource(value, columns), `${x}:${y}`).map((line, i) => (
      <g key={line.id}>{text(line.text, x, y + i * 28)}</g>
    ));
  let graphic: ReactElement;
  if (scene.storyId === '53') {
    const pair = scene.relations.find((r) => r.id === page.correspondenceId) ?? scene.relations[0];
    graphic = (
      <g data-correspondence-id={pair.id} data-state={pair.state} data-qualifier={pair.qualifier}>
        {text('Supplied paired views', 12, 30)}
        {[
          { role: 'from', actorId: pair.fromActorId, frameId: pair.fromFrameId },
          { role: 'to', actorId: pair.toActorId, frameId: pair.toFrameId },
        ].map((station, i) => {
          const x = 24 + i * 230;
          const actor = scene.entities.find((e) => e.id === station.actorId);
          const frame = scene.frames.find((f) => f.id === station.frameId);
          return (
            <g
              key={`${pair.id}:${station.role}`}
              data-actor-id={station.actorId}
              data-frame-id={station.frameId}
            >
              <path d={`M${x} 120V50M${x} 120h174`} stroke={S.muted} strokeWidth={2} fill="none" />
              <circle cx={x + 80} cy={85} r={8} fill={S.accent} />
              {wrapped(actor?.label ?? 'Not supplied', x, 162, 8)}
              {wrapped(frame?.label ?? 'Not supplied', x, 302, 8)}
              {text('Schematic axes', x, 430)}
            </g>
          );
        })}
        <path d="M112 85H326" fill="none" stroke={S.accent} strokeWidth={2} strokeDasharray="5 4" />
        {text('Schematic, not calculated', 12, 472)}
      </g>
    );
  } else {
    const matrix =
      scene.records.find((m) => m.id === page.matrixId) ??
      scene.products.find((p) => p.id === page.matrixId) ??
      scene.records[0];
    const row = matrix.rows.find((r) => r.id === page.rowId) ?? matrix.rows[0];
    graphic = (
      <g data-matrix-id={matrix.id} data-row-id={row.id} data-state={matrix.state}>
        {text('Exact current row', 12, 30)}
        {wrapped('label' in matrix ? matrix.label : 'Derived matrix-product', 12, 66, 18)}
        {text(`Row ${matrix.rows.indexOf(row) + 1}`, 12, 142)}
        {matrix.columns.map((column, j) => {
          const cell = matrix.cells.find((c) => c.rowId === row.id && c.columnId === column.id);
          const value = cell
            ? 'result' in cell
              ? exactText(cell.result)
              : 'amount' in cell.quantity && cell.quantity.amount.kind === 'rational'
                ? (cell.quantity.amount.notation ?? exactText(cell.quantity.amount.value))
                : cell.quantity.state
            : 'Not supplied';
          return (
            <g
              key={column.id}
              data-column-id={column.id}
              data-cell-id={cell?.id}
              data-cell-state={
                cell ? ('result' in cell ? 'derived' : cell.quantity.state) : 'not-supplied'
              }
            >
              <rect
                x={12 + j * 112}
                y={166}
                width={104}
                height={280}
                fill={S.card}
                stroke={S.muted}
              />
              {text(`C${j + 1}`, 24 + j * 112, 194)}
              {wrapped(value, 24 + j * 112, 234, 4)}
            </g>
          );
        })}
        {text('Identities and basis at right', 12, 472)}
      </g>
    );
  }
  return (
    <g data-page-id={page.id} data-page={pose.page}>
      {graphic}
      {sourceLines(page.lines, `${page.id}:${pose.page}`).map((line, i) => (
        <g key={line.id}>{text(line.text, 492, 38 + i * 28)}</g>
      ))}
    </g>
  );
}
