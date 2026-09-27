/**
 * Dispatch a scene to its component. Every component draws inside the
 * 1080×960 virtual stage; <SceneFrame> places that stage in the layout.
 */

import type React from 'react';
import { BeforeAfterScene } from './BeforeAfterScene';
import { ChartScene } from './ChartScene';
import { ChatScene } from './ChatScene';
import { ChecklistScene } from './ChecklistScene';
import { FlowScene } from './FlowScene';
import { FunnelScene } from './FunnelScene';
import { HeroScene } from './HeroScene';
import { LoopScene } from './LoopScene';
import { MythFactScene } from './MythFactScene';
import { NetworkScene } from './NetworkScene';
import { NotesScene } from './NotesScene';
import { NumberScene } from './NumberScene';
import { QuestionScene } from './QuestionScene';
import { StackScene } from './StackScene';
import { StampScene } from './StampScene';
import { StatementScene } from './StatementScene';
import { TimelineScene } from './TimelineScene';
import type { ExplainerScene } from './types';
import { VersusScene } from './VersusScene';

export const SceneBody: React.FC<{ scene: ExplainerScene }> = ({ scene }) => {
  switch (scene.kind) {
    case 'checklist':
      return <ChecklistScene scene={scene} />;
    case 'versus':
      return <VersusScene scene={scene} />;
    case 'stamp':
      return <StampScene scene={scene} />;
    case 'flow':
      return <FlowScene scene={scene} />;
    case 'stack':
      return <StackScene scene={scene} />;
    case 'statement':
      return <StatementScene scene={scene} />;
    case 'number':
      return <NumberScene scene={scene} />;
    case 'timeline':
      return <TimelineScene scene={scene} />;
    case 'notes':
      return <NotesScene scene={scene} />;
    case 'question':
      return <QuestionScene scene={scene} />;
    case 'before-after':
      return <BeforeAfterScene scene={scene} />;
    case 'chart':
      return <ChartScene scene={scene} />;
    case 'chat':
      return <ChatScene scene={scene} />;
    case 'network':
      return <NetworkScene scene={scene} />;
    case 'loop':
      return <LoopScene scene={scene} />;
    case 'myth-fact':
      return <MythFactScene scene={scene} />;
    case 'funnel':
      return <FunnelScene scene={scene} />;
    case 'hero':
      return <HeroScene scene={scene} />;
  }
};
