import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import {
  CACHE_STREAM_DETAIL,
  type CacheStreamPose,
  cacheStreamLineRuns,
  cacheStreamWrap,
} from './cache-stream-poses';
import type { ExpansionCacheStreamScene } from './cache-stream-types';

/** Authored request/record lanes: precision and absence are planar in both modes. */
export function CacheStreamDiagram({
  scene,
  pose,
}: {
  scene: ExpansionCacheStreamScene;
  pose: CacheStreamPose;
}): ReactElement {
  const S = useStage(),
    page = pose.pages[pose.page],
    fact = page.fact;
  const name = (id: string) => scene.entities.find((e) => e.id === id)?.label ?? id;
  const text = (value: string, x: number, y: number) => (
    <text x={x} y={y} fontFamily={UI_FONT} fontSize={22} fill={S.text}>
      {value}
    </text>
  );
  const q = fact?.qualification;
  const value = q && 'value' in q ? q.value : q?.state;
  return (
    <g data-cache-stream-page={page.id} data-fact-id={fact?.id}>
      {text(
        scene.storyId === '65' ? 'Cache / request ledger' : 'Input / processing ledger',
        24,
        38,
      )}
      {[
        { id: page.actorId, role: 'actor', column: 0 },
        { id: page.targetId, role: 'target', column: 1 },
      ].map(({ id, role, column }) => (
        <g key={`${role}:${id}`} data-source-id={id}>
          <rect
            x={24 + column * 236}
            y={70}
            width={190}
            height={210}
            rx={12}
            fill={S.card}
            stroke={S.muted}
          />
          {text(column ? 'Source target' : 'Reporting actor', 36 + column * 236, 100)}
          {cacheStreamLineRuns(cacheStreamWrap(name(id), 9), `${role}:${id}`).map((run, row) => (
            <g key={run.id}>{text(run.text, 36 + column * 236, 136 + row * 28)}</g>
          ))}
        </g>
      ))}
      {fact && (
        <g data-role={fact.role} data-state={q?.state}>
          <path
            d="M214 246H260m-8 -6l8 6l-8 6"
            fill="none"
            stroke={S.accent}
            strokeWidth={3}
            strokeDasharray={q?.state === 'known' ? undefined : '5 5'}
          />
          {text(fact.role, 24, 314)}
          <text
            data-qualification-state={fact.qualification.state}
            x={260}
            y={314}
            fontFamily={UI_FONT}
            fontSize={22}
            fill={S.text}
          >
            {fact.qualification.state}
          </text>
          {cacheStreamLineRuns(cacheStreamWrap(value ?? '', 18), `${fact.id}:value`).map(
            (run, row) => (
              <g key={run.id}>{text(run.text, 24, 350 + row * 28)}</g>
            ),
          )}
          {fact.role === 'grouping' && (
            <path d="M260 288V296H450V288" fill="none" stroke={S.accent} strokeWidth={3} />
          )}
          {fact.role === 'arrival' && (
            <path
              d={
                value === 'together'
                  ? 'M36 410H432M36 426H432'
                  : value === 'individually'
                    ? 'M36 410H190M270 426H432'
                    : value === 'unordered'
                      ? 'M36 410L432 426M36 426L432 410'
                      : 'M36 418H432'
              }
              strokeDasharray={q?.state !== 'known' || !q || !('value' in q) ? '5 5' : undefined}
              fill="none"
              stroke={S.muted}
              strokeWidth={3}
            />
          )}
          {fact.role === 'processing' && (
            <rect
              x={24}
              y={410}
              width={426}
              height={30}
              rx={value === 'batch' ? 0 : 15}
              fill="none"
              stroke={S.accent}
              strokeDasharray={value === 'pending' || q?.state !== 'known' ? '5 5' : undefined}
            />
          )}
        </g>
      )}
      <rect x={484} y={8} width={460} height={462} rx={12} fill={S.card} stroke={S.accent} />
      {cacheStreamLineRuns(page.lines, page.id).map((run, row) => (
        <g key={run.id}>
          {text(
            run.text,
            CACHE_STREAM_DETAIL.x,
            CACHE_STREAM_DETAIL.y + row * CACHE_STREAM_DETAIL.leading,
          )}
        </g>
      ))}
      {text(`Source page ${pose.page + 1}/${pose.pages.length}`, 500, 454)}
    </g>
  );
}
