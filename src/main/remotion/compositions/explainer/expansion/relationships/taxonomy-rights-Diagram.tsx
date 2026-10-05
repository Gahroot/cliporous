import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import type { TaxonomyRightsPose } from './taxonomy-rights-poses';
import type { ExpansionTaxonomyRightsScene, ExpansionTaxonomyScene } from './taxonomy-rights-types';

export function taxonomyNodePositions(
  scene: ExpansionTaxonomyScene,
): ReadonlyMap<string, { x: number; y: number }> {
  // Only confirmed direct parent links influence ordering. No ancestor membership is emitted.
  const depth = (id: string): number => {
    const parents = scene.relations.filter(
      (r) =>
        r.role === 'parent' && r.fromId === id && r.state === 'known' && r.status === 'included',
    );
    return parents.length ? 1 + Math.max(...parents.map((r) => depth(r.toId))) : 0;
  };
  const categories = scene.entities
    .filter((e) => e.type === 'category')
    .sort((a, b) => depth(a.id) - depth(b.id));
  const members = scene.entities.filter((e) => e.type === 'member');
  return new Map<string, { x: number; y: number }>([
    ...categories.map((e, i) => [e.id, { x: 100, y: 76 + i * 36 }] as const),
    ...members.map((e, i) => [e.id, { x: 344, y: 76 + i * 36 }] as const),
  ]);
}

export const TAXONOMY_RIGHTS_LAYOUT = {
  overview: { x: 8, y: 8, width: 432, height: 462 },
  detail: { x: 456, y: 8, width: 488, height: 462 },
  font: 22,
  lineHeight: 32,
} as const;
/** Navigation references retain parser IDs; complete source text lives in the current planar lens. */
export function TaxonomyRightsDiagram({
  scene,
  pose,
}: {
  scene: ExpansionTaxonomyRightsScene;
  pose: TaxonomyRightsPose;
}): ReactElement {
  const S = useStage();
  const text = (value: string, x: number, y: number): ReactElement => (
    <text x={x} y={y} fontFamily={UI_FONT} fontSize={22} fill={S.text}>
      {value}
    </text>
  );
  const index = (id: string): number => scene.entities.findIndex((e) => e.id === id) + 1;
  const page = pose.pages[pose.page];
  const pageLines = page.lines.map((line, offset) => ({
    id: `${page.id}:${pose.page}:${offset}:${line}`,
    line,
    y: 72 + offset * 32,
  }));
  const nodes = scene.storyId === '33' ? taxonomyNodePositions(scene) : undefined;
  const selected =
    scene.storyId === '33'
      ? (scene.relations.find((r) => r.id === page.id) ??
        (page.id === 'resolve' ? scene.relations.at(-1) : scene.relations[0]))
      : undefined;
  const from = selected ? nodes?.get(selected.fromId) : undefined;
  const to = selected ? nodes?.get(selected.toId) : undefined;
  return (
    <g data-taxonomy-rights-page={pose.page} data-source-id={page.id}>
      <rect
        x={456}
        y={8}
        width={488}
        height={462}
        rx={12}
        fill={S.card}
        stroke={S.accent}
        strokeWidth={2}
      />
      {scene.storyId === '33' ? (
        <>
          {text('Categories', 48, 32)}
          {text('Members', 292, 32)}
          {selected && from && to && (
            <g
              data-relation-id={selected.id}
              data-from-id={selected.fromId}
              data-to-id={selected.toId}
              data-role={selected.role}
              data-state={selected.state}
              data-status={'status' in selected ? selected.status : selected.state}
            >
              <path
                data-typed-edge={selected.role}
                d={`M${from.x + (selected.role === 'parent' ? 44 : -44)} ${from.y} C220 ${from.y} 220 ${to.y} ${to.x + 44} ${to.y}`}
                fill="none"
                stroke={S.accent}
                strokeWidth={3}
                strokeDasharray={
                  selected.state === 'known' && selected.status === 'included' ? undefined : '6 5'
                }
              />
              <path
                d={`M${to.x + 54} ${to.y - 6} L${to.x + 44} ${to.y} L${to.x + 54} ${to.y + 6}`}
                fill="none"
                stroke={S.accent}
                strokeWidth={3}
              />
              {'status' in selected && selected.status === 'excluded' && (
                <path
                  data-excluded-cross="true"
                  d={`M208 ${(from.y + to.y) / 2 - 8}L224 ${(from.y + to.y) / 2 + 8}M208 ${(from.y + to.y) / 2 + 8}L224 ${(from.y + to.y) / 2 - 8}`}
                  stroke={S.text}
                  strokeWidth={3}
                />
              )}
              {text(
                `R${scene.relations.findIndex((r) => r.id === selected.id) + 1} · ${selected.role}`,
                8,
                334,
              )}
              {text(
                `${selected.state}${'status' in selected ? ` · ${selected.status}` : ''}`,
                8,
                366,
              )}
            </g>
          )}
          {scene.entities.map((e) => {
            const p = nodes?.get(e.id);
            return p ? (
              <g key={e.id} data-taxonomy-node={e.id} data-type={e.type}>
                {e.type === 'category' ? (
                  <rect
                    x={p.x - 44}
                    y={p.y - 18}
                    width={88}
                    height={32}
                    rx={4}
                    fill={S.card}
                    stroke={S.text}
                  />
                ) : (
                  <ellipse cx={p.x} cy={p.y - 2} rx={44} ry={16} fill={S.card} stroke={S.text} />
                )}
                {text(`${e.type === 'category' ? 'C' : 'M'}${index(e.id)}`, p.x - 16, p.y + 6)}
              </g>
            ) : null;
          })}
          {text('C category / M member', 8, 464)}
        </>
      ) : (
        <>
          {(['economic', 'voting', 'control'] as const).map((right, column) => (
            <g key={right} data-right={right}>
              {text(right, 8 + column * 144, 32)}
              {scene.relations
                .filter((r) => r.right === right)
                .map((r, row) => (
                  <g
                    key={r.id}
                    data-relation-id={r.id}
                    data-actor-id={r.actorId}
                    data-resource-id={r.resourceId}
                    data-state={r.state}
                    data-status={'status' in r ? r.status : r.state}
                  >
                    {text(
                      `R${scene.relations.findIndex((relation) => relation.id === r.id) + 1} ${index(r.actorId)}:${index(r.resourceId)} ${'status' in r ? (r.status === 'granted' ? '+' : '−') : '?'}`,
                      8 + column * 144,
                      60 + row * 24,
                    )}
                  </g>
                ))}
            </g>
          ))}
          {text('Ownership ≠ control; + grant / − denial', 8, 464)}
        </>
      )}
      {scene.entities.map((e, i) => (
        <g key={e.id} data-entity-id={e.id} data-type={e.type}>
          {text(`E${i + 1}`, 14 + i * 52, 438)}
        </g>
      ))}
      {text(`${pose.page + 1}/${pose.pages.length} · ${page.id}`, 472, 38)}
      {pageLines.map((entry) => (
        <g key={entry.id}>{text(entry.line, 472, entry.y)}</g>
      ))}
    </g>
  );
}
