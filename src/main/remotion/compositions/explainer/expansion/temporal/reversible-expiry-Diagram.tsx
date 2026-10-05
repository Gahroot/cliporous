import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import { permissionText, type ReversibleExpiryPose } from './reversible-expiry-poses';
import type { ExpansionReversibleExpiryScene } from './reversible-expiry-types';

/** Match the parser's qualification key without rewriting either supplied label. */
function qualificationKey(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/’/g, "'")
    .replace(/−/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function ReversibleExpiryDiagram({
  scene,
  pose,
}: {
  scene: ExpansionReversibleExpiryScene;
  pose: ReversibleExpiryPose;
}): ReactElement {
  const S = useStage();
  const text = (value: string, x: number, y: number): ReactElement => (
    <text x={x} y={y} fontFamily={UI_FONT} fontSize={22} fill={S.text}>
      {value}
    </text>
  );
  const page = pose.pages[pose.page];
  const selected = scene.relations.find((r) => r.id === page.id) ?? scene.relations[0];
  const pageLines = page.lines.map((line, offset) => ({
    id: `${page.id}:${pose.page}:${offset}:${line}`,
    line,
    y: 72 + offset * 32,
  }));
  return (
    <g data-reversible-expiry-page={pose.page} data-source-id={page.id}>
      <rect x={456} y={8} width={488} height={462} rx={12} fill={S.card} stroke={S.accent} />
      {scene.storyId === '43' ? (
        <>
          {text('Source state rail', 8, 32)}
          <path d="M100 62V316" fill="none" stroke={S.muted} strokeWidth={3} />
          {scene.stateIds.map((id, i) => (
            <g key={id} data-state-id={id}>
              <rect
                x={48}
                y={60 + i * 44}
                width={104}
                height={32}
                rx={8}
                fill={S.card}
                stroke={S.text}
              />
              {text(`S${i + 1}`, 84, 84 + i * 44)}
            </g>
          ))}
          {'fromId' in selected && (
            <g
              data-transition-id={selected.id}
              data-permission={permissionText(selected)}
              data-execution="not-inferred"
            >
              <path
                d={`M160 ${76 + scene.stateIds.indexOf(selected.fromId) * 44}H260V${76 + scene.stateIds.indexOf(selected.toId) * 44}H160`}
                fill="none"
                stroke={S.accent}
                strokeWidth={3}
                strokeDasharray={selected.state === 'allowed' ? undefined : '6 5'}
              />
              <path
                d={`M170 ${70 + scene.stateIds.indexOf(selected.toId) * 44}L160 ${76 + scene.stateIds.indexOf(selected.toId) * 44}L170 ${82 + scene.stateIds.indexOf(selected.toId) * 44}`}
                fill="none"
                stroke={S.accent}
              />
              {text(`R${scene.relations.indexOf(selected) + 1}: ${selected.state}`, 8, 344)}
            </g>
          )}
          {text('Permission ≠ execution', 8, 376)}
          {scene.records.map((r) =>
            r.id ===
            (scene.records.find((record) => record.id === page.id) ?? scene.records[0]).id ? (
              <g key={r.id} data-record-id={r.id} data-state={r.state}>
                {text(
                  `Reported: ${'valueId' in r ? `S${scene.stateIds.indexOf(r.valueId) + 1}` : 'unknown'}`,
                  8,
                  408,
                )}
              </g>
            ) : null,
          )}
        </>
      ) : (
        <>
          {text('Represented clock', 8, 32)}
          {pose.marks.map((m, i) => (
            <g key={m.id} data-timing-id={m.id} data-state={m.quantity.state} data-role={m.role}>
              <path d={`M40 ${64 + i * 32}H400`} stroke={S.muted} />
              {m.x === null ? (
                text(`T${i + 1}: ${m.quantity.state}`, 48, 58 + i * 32)
              ) : (
                <>
                  <path
                    d={`M${m.x} ${54 + i * 32}V${74 + i * 32}`}
                    stroke={m.role === 'deadline' ? S.text : S.accent}
                    strokeWidth={3}
                    strokeDasharray={m.quantity.state === 'conditional' ? '4 3' : undefined}
                  />
                  {text(`T${i + 1}`, 8, 70 + i * 32)}
                </>
              )}
            </g>
          ))}
          {scene.records
            .filter((r) => r.type === 'validity')
            .map((r) => {
              const start = pose.marks.find((m) => m.id === `${r.id}:start`);
              const end = pose.marks.find((m) => m.id === `${r.id}:end`);
              const qualified =
                (r.representedStart.state === 'known' && r.representedEnd.state === 'known') ||
                (r.representedStart.state === 'conditional' &&
                  r.representedEnd.state === 'conditional' &&
                  qualificationKey(r.representedStart.condition) ===
                    qualificationKey(r.representedEnd.condition));
              return start?.x !== null &&
                start?.x !== undefined &&
                end?.x !== null &&
                end?.x !== undefined &&
                qualified ? (
                <g key={r.id} data-validity-id={r.id}>
                  <rect
                    x={start.x}
                    y={320}
                    width={end.x - start.x}
                    height={16}
                    fill={S.card}
                    stroke={S.accent}
                    strokeDasharray={r.representedStart.state === 'conditional' ? '4 3' : undefined}
                  />
                  {text('Supplied window', 8, 364)}
                </g>
              ) : (
                <g key={r.id} data-validity-id={r.id}>
                  {text('Unresolved window', 8, 364)}
                </g>
              );
            })}
          {text('Clock ≠ authorization', 8, 396)}
          {text('Supplied, not calculated', 8, 428)}
        </>
      )}
      {text(`Result: ${scene.result.state}`, 8, 464)}
      {text(`${pose.page + 1}/${pose.pages.length}`, 472, 38)}
      {pageLines.map((entry) => (
        <g key={entry.id}>{text(entry.line, 472, entry.y)}</g>
      ))}
    </g>
  );
}
