/**
 * Dispatch a scene to its component. Every component draws inside the
 * 1080×960 virtual stage; <SceneFrame> places that stage in the layout.
 */

import type React from 'react';
import { BalanceScene } from './BalanceScene';
import { BeforeAfterScene } from './BeforeAfterScene';
import { ChartScene } from './ChartScene';
import { ChatScene } from './ChatScene';
import { ChecklistScene } from './ChecklistScene';
import { CodeScene } from './CodeScene';
import { CompoundScene } from './CompoundScene';
import { DefinitionScene } from './DefinitionScene';
import { DominoesScene } from './DominoesScene';
import { EquationScene } from './EquationScene';
import { FlowScene } from './FlowScene';
import { FunnelScene } from './FunnelScene';
import { HeadlineScene } from './HeadlineScene';
import { HeroScene } from './HeroScene';
import { IcebergScene } from './IcebergScene';
import { JourneyScene } from './JourneyScene';
import { LoopScene } from './LoopScene';
import { MythFactScene } from './MythFactScene';
import { NetworkScene } from './NetworkScene';
import { NotesScene } from './NotesScene';
import { NumberScene } from './NumberScene';
import { PictogramScene } from './PictogramScene';
import { PodiumScene } from './PodiumScene';
import { QuadrantScene } from './QuadrantScene';
import { QuestionScene } from './QuestionScene';
import { QuoteScene } from './QuoteScene';
import { RankingScene } from './RankingScene';
import { ReceiptScene } from './ReceiptScene';
import { SearchScene } from './SearchScene';
import { SpectrumScene } from './SpectrumScene';
import { StackScene } from './StackScene';
import { StairsScene } from './StairsScene';
import { StampScene } from './StampScene';
import { StatementScene } from './StatementScene';
import { StreakScene } from './StreakScene';
import { StudyScene } from './StudyScene';
import { TimelineScene } from './TimelineScene';
import type { ExplainerScene } from './types';
import { VennScene } from './VennScene';
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
    case 'equation':
      return <EquationScene scene={scene} />;
    case 'quadrant':
      return <QuadrantScene scene={scene} />;
    case 'venn':
      return <VennScene scene={scene} />;
    case 'definition':
      return <DefinitionScene scene={scene} />;
    case 'study':
      return <StudyScene scene={scene} />;
    case 'pictogram':
      return <PictogramScene scene={scene} />;
    case 'ranking':
      return <RankingScene scene={scene} />;
    case 'receipt':
      return <ReceiptScene scene={scene} />;
    case 'streak':
      return <StreakScene scene={scene} />;
    case 'spectrum':
      return <SpectrumScene scene={scene} />;
    case 'quote':
      return <QuoteScene scene={scene} />;
    case 'headline':
      return <HeadlineScene scene={scene} />;
    case 'journey':
      return <JourneyScene scene={scene} />;
    case 'search':
      return <SearchScene scene={scene} />;
    case 'code':
      return <CodeScene scene={scene} />;
    case 'iceberg':
      return <IcebergScene scene={scene} />;
    case 'balance':
      return <BalanceScene scene={scene} />;
    case 'podium':
      return <PodiumScene scene={scene} />;
    case 'compound':
      return <CompoundScene scene={scene} />;
    case 'dominoes':
      return <DominoesScene scene={scene} />;
    case 'stairs':
      return <StairsScene scene={scene} />;
  }
};
