import type { ReactElement } from 'react';
import { UI_FONT, useStage } from '../../stage';
import {
  RETRY_PRODUCT_DETAIL,
  type RetryProductPose,
  retryProductWrap,
} from './retry-product-poses';
import type { ExpansionRetryProductScene } from './retry-product-types';

/** Separate role lanes: an attempt never increments an effect or grants a permission. */
export function RetryProductDiagram({
  scene,
  pose,
}: {
  scene: ExpansionRetryProductScene;
  pose: RetryProductPose;
}): ReactElement {
  const S = useStage(),
    page = pose.pages[pose.page];
  const active =
    scene.records.find((r) => page.recordIds.includes(r.id)) ?? scene.records[pose.phase];
  const identityRuns = retryProductWrap(scene.subject, 8).map((line, offset) => ({
    line,
    id: `${scene.storyId}:identity:${offset * 8}`,
    y: 42 + offset * 28,
  }));
  const text = (value: string, x: number, y: number) => (
    <text x={x} y={y} fontFamily={UI_FONT} fontSize={22} fill={S.text}>
      {value}
    </text>
  );
  return (
    <g data-retry-product-page={pose.page} data-source-id={page.id}>
      {scene.records.map((r, i) => (
        <g key={r.id} data-record-id={r.id} data-state={r.state}>
          <circle cx={36} cy={34 + i * 30} r={8} fill={r.id === active.id ? S.accent : S.muted} />
          {text(r.role, 54, 42 + i * 30)}
        </g>
      ))}
      {identityRuns.map((run) => (
        <g key={run.id}>{text(run.line, 260, run.y)}</g>
      ))}
      <g data-selected-record={active.id} data-role={active.role} data-shape={active.shape}>
        {scene.storyId === '67' ? (
          <>
            <path
              d="M24 186H206L228 208V318H24ZM206 186V208H228M40 218H204M40 246H204M40 274H204"
              fill={S.card}
              stroke={S.accent}
              strokeWidth={2}
            />
            {active.role === 'attempt' && (
              <path
                d="M248 226C290 192 324 248 278 276M278 276L278 260M278 276L294 276"
                fill="none"
                stroke={S.accent}
                strokeWidth={3}
              />
            )}
            {active.role === 'effect' && (
              <path
                d="M254 208H334V288H254ZM270 232H318M270 258H318"
                fill={S.card}
                stroke={S.accent}
                strokeWidth={2}
              />
            )}
            {active.role === 'condition' && (
              <path
                d="M284 192L334 242L284 292L234 242Z"
                fill={S.card}
                stroke={S.accent}
                strokeWidth={2}
              />
            )}
          </>
        ) : (
          <>
            <rect
              x={24}
              y={186}
              width={320}
              height={132}
              rx={8}
              fill={S.card}
              stroke={S.accent}
              strokeWidth={2}
            />
            <path
              d={
                active.shape === 'table'
                  ? 'M24 226H344M24 272H344M130 226V318M236 226V318'
                  : active.shape === 'task'
                    ? 'M40 220H60V240H40ZM80 232H324M40 260H60V280H40ZM80 272H324'
                    : active.shape === 'result'
                      ? 'M40 204H328V300H40ZM60 234H300M60 272H260'
                      : 'M40 218H328M40 252H328M40 286H228'
              }
              fill="none"
              stroke={S.muted}
              strokeWidth={2}
            />
          </>
        )}
        {text(active.state, 24, 352)}
      </g>
      <rect x={484} y={8} width={460} height={462} rx={12} fill={S.card} stroke={S.accent} />
      {page.quantityState !== undefined && (
        <g data-quantity-index={page.quantityIndex} data-quantity-state={page.quantityState}>
          {text(`Quantity: ${page.quantityState}`, 500, 38)}
        </g>
      )}
      {page.lines.map((line, i) => (
        <g key={page.lineIds[i]} data-line-id={page.lineIds[i]}>
          {text(
            line,
            RETRY_PRODUCT_DETAIL.x,
            RETRY_PRODUCT_DETAIL.y + i * RETRY_PRODUCT_DETAIL.leading,
          )}
        </g>
      ))}
      {text(`Source lens ${pose.page + 1}/${pose.pages.length}`, 500, 454)}
    </g>
  );
}
