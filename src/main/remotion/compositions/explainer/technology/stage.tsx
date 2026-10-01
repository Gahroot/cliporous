import type React from 'react';
import { useStage } from '../stage';
import { TECHNOLOGY_STAGE } from './types';

/** SceneFrame owns the layout transform; families draw in one fixed editorial safe area. */
export function TechnologyStage({
  label,
  condition,
  children,
}: {
  label: string;
  condition?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const S = useStage();
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: TECHNOLOGY_STAGE.width,
        height: TECHNOLOGY_STAGE.height,
        color: S.text,
        fontFamily: S.font,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 64,
          top: 64,
          width: 952,
          fontFamily: S.serif,
          fontSize: 62,
          lineHeight: 1.06,
          textAlign: 'left',
          overflowWrap: 'anywhere',
        }}
      >
        {label}
      </div>
      {condition && (
        <div
          style={{
            position: 'absolute',
            left: 64,
            top: 142,
            width: 952,
            fontSize: 30,
            fontWeight: 650,
            lineHeight: 1.15,
          }}
        >
          {condition}
        </div>
      )}
      {children}
    </div>
  );
}
