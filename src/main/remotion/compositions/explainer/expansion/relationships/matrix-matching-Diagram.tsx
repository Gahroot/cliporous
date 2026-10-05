import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import { capacityPositions, entityCode, type MatrixMatchingPose } from './matrix-matching-poses';
import type { ExpansionMatrixMatchingScene } from './matrix-matching-types';

/** Persistent sparse matrix and identity graph. The current source record links both views. */
export function MatrixMatchingDiagram({
  scene,
  pose,
}: {
  scene: ExpansionMatrixMatchingScene;
  pose: MatrixMatchingPose;
}): ReactElement {
  const S = useStage();
  const page = pose.pages[pose.page];
  const text = (value: string, x: number, y: number): ReactElement => (
    <text x={x} y={y} fontSize={22} fontFamily={UI_FONT} fill={S.text}>
      {value}
    </text>
  );
  const rows = scene.storyId === '37' ? scene.matrix.rowIds : scene.candidateIds;
  const columns = scene.storyId === '37' ? scene.matrix.columnIds : scene.destinationIds;
  const pairs =
    scene.storyId === '37'
      ? scene.relations.map((r) => ({
          ...r,
          code: { association: 'A', dependency: 'D', transfer: 'T' }[r.role],
        }))
      : scene.eligibility.map((r) => ({
          ...r,
          fromId: r.candidateId,
          toId: r.destinationId,
          code: r.status === 'eligible' ? 'E' : r.status === 'denied' ? 'N' : '?',
        }));
  const active = pairs.find((r) => r.id === page.id);
  const node = (id: string): [number, number] => {
    const i = scene.entities.findIndex((e) => e.id === id);
    if (i < 0) throw new Error('Missing graph entity');
    const angle = (i / scene.entities.length) * Math.PI * 2;
    return [225 + Math.cos(angle) * 185, 376 + Math.sin(angle) * 36];
  };
  const link = (
    from: string,
    to: string,
    directed: boolean,
    id: string,
    state: string,
    eligibility = false,
  ): ReactElement => {
    const [x, y] = node(from),
      [z, w] = node(to);
    const length = Math.hypot(z - x, w - y);
    const dx = length === 0 ? 1 : (z - x) / length,
      dy = length === 0 ? 0 : (w - y) / length;
    const endX = z - dx * 23,
      endY = w - dy * 23;
    return (
      <g
        data-link-id={id}
        data-from-id={from}
        data-to-id={to}
        data-state={state}
        data-link-role={eligibility ? 'eligibility' : 'supplied'}
        data-direction={directed ? 'from-to' : 'undirected'}
      >
        <path
          d={
            length === 0
              ? `M${x + 23} ${y}C${x + 60} ${y - 28} ${x - 60} ${y - 28} ${endX} ${endY}`
              : `M${x + dx * 23} ${y + dy * 23}L${endX} ${endY}`
          }
          stroke={S.accent}
          strokeWidth={3}
          strokeDasharray={state !== 'known' ? '5 4' : eligibility ? '2 4' : undefined}
          fill="none"
        />
        {directed && (
          <path
            d={`M${endX} ${endY}L${endX - dx * 12 + dy * 6} ${endY - dy * 12 - dx * 6}L${endX - dx * 12 - dy * 6} ${endY - dy * 12 + dx * 6}Z`}
            fill={S.accent}
          />
        )}
      </g>
    );
  };
  const record = scene.storyId === '38' ? scene.records.find((r) => r.id === page.id) : undefined;
  const capacityMarkers =
    record?.type === 'capacity'
      ? capacityPositions(scene, record.id).map((position, index) => {
          const q = record.quantity;
          const alternative =
            q.state === 'disputed' ? q.alternatives[index] : 'amount' in q ? q.amount : undefined;
          return { position, id: `${record.id}:${JSON.stringify(alternative)}` };
        })
      : [];
  const textLines = page.lines.map((line, index) => ({
    line,
    y: 38 + index * 28,
    id: `${page.id}:${pose.page}:${line}:${index}`,
  }));
  return (
    <g data-source-record={page.id} data-page={pose.page}>
      {text(
        scene.storyId === '37' ? 'Same IDs: matrix + graph' : 'Eligibility is not assignment',
        12,
        30,
      )}
      {columns.map((id, j) => (
        <g key={id} data-column-id={id}>
          {text(entityCode(scene, id), 78 + j * (370 / columns.length), 62)}
        </g>
      ))}
      {rows.map((id, i) => (
        <g key={id} data-row-id={id}>
          {text(entityCode(scene, id), 12, 94 + i * 32)}
          {columns.map((to, j) => {
            const supplied = pairs.filter((r) => r.fromId === id && r.toId === to);
            const x = 70 + j * (370 / columns.length),
              y = 72 + i * 32;
            return (
              <g
                key={to}
                data-from-id={id}
                data-to-id={to}
                data-cell-state={supplied.length ? 'supplied' : 'not-supplied'}
              >
                <rect
                  x={x}
                  y={y}
                  width={370 / columns.length - 4}
                  height={30}
                  fill={supplied.some((r) => r.id === page.id) ? S.card : 'none'}
                  stroke={S.muted}
                />
                {supplied.length === 0
                  ? text('?', x + 8, y + 23)
                  : supplied.map((r, k) => (
                      <g key={r.id} data-pair-id={r.id} data-state={r.state}>
                        {active?.id === r.id ? (
                          text(r.code, x + 6 + k * 22, y + 23)
                        ) : (
                          <circle
                            cx={x + 12 + k * 22}
                            cy={y + 15}
                            r={4}
                            fill={r.state === 'known' ? S.accent : 'none'}
                            stroke={S.accent}
                          />
                        )}
                      </g>
                    ))}
              </g>
            );
          })}
        </g>
      ))}
      {text(
        active
          ? `${'role' in active ? active.role : 'Eligibility'}: ${active.state}`
          : record
            ? `${record.type === 'capacity' ? 'Capacity' : 'Match'}: ${record.type === 'capacity' ? record.quantity.state : record.state}`
            : 'No inferred links',
        12,
        312,
      )}
      {active &&
        link(
          active.fromId,
          active.toId,
          scene.storyId === '37' &&
            scene.relations.find((r) => r.id === active.id)?.direction === 'from-to',
          active.id,
          active.state,
          scene.storyId === '38',
        )}
      {record?.type === 'match' &&
        record.status === 'matched' &&
        link(record.candidateId, record.destinationId, true, record.id, record.state)}
      {scene.entities.map((e) => {
        const [x, y] = node(e.id);
        return (
          <g key={e.id} data-entity-id={e.id}>
            <circle cx={x} cy={y} r={22} stroke={S.muted} fill={S.card} />
            {text(entityCode(scene, e.id), x - 15, y + 8)}
          </g>
        );
      })}
      {record?.type === 'capacity' && (
        <g data-capacity-id={record.id}>
          <path d="M24 438H434" stroke={S.muted} />
          {capacityMarkers.map(({ position, id }) => (
            <circle
              key={id}
              data-position={position}
              cx={24 + position * 410}
              cy={438}
              r={6}
              fill={S.accent}
            />
          ))}
        </g>
      )}
      {text(
        record?.type === 'match'
          ? record.status === 'matched'
            ? 'Supplied match only'
            : 'Unresolved, not denied'
          : record?.type === 'capacity'
            ? 'Exact supplied capacity; no slots'
            : '? / blank: not supplied, not zero',
        12,
        472,
      )}
      <rect x={484} y={8} width={460} height={462} rx={12} fill={S.card} stroke={S.accent} />
      {textLines.map(({ line, y, id }) => (
        <g key={id}>{text(line, 500, y)}</g>
      ))}
      {text(`Source ${pose.page + 1}/${pose.pages.length}`, 500, 454)}
    </g>
  );
}
