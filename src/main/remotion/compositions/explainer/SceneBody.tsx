/**
 * Dispatch a scene to its component. Every component draws inside the
 * 1080×960 virtual stage; <SceneFrame> places that stage in the layout.
 */

import type React from 'react';
import { AgentWorkflowScene } from './AgentWorkflowScene';
import { BalanceScene } from './BalanceScene';
import { BeforeAfterScene } from './BeforeAfterScene';
import { BottleneckScene } from './BottleneckScene';
import { ChartScene } from './ChartScene';
import { ChatScene } from './ChatScene';
import { ChecklistScene } from './ChecklistScene';
import { CodeScene } from './CodeScene';
import { CompoundScene } from './CompoundScene';
import { ContextWindowScene } from './ContextWindowScene';
import { CognitionSceneView } from './cognition/CognitionSceneView';
import { AdaptiveSceneView } from './concepts/adaptive/Scene';
import { BusinessOperationsSceneView } from './concepts/business-operations/Scene';
import { BusinessPopulationsSceneView } from './concepts/business-populations/Scene';
import { InferenceSceneView } from './concepts/inference/Scene';
import { InformationSceneView } from './concepts/information/Scene';
import { PerspectiveSceneView } from './concepts/perspective/Scene';
import { DefinitionScene } from './DefinitionScene';
import { DominoesScene } from './DominoesScene';
import { EquationScene } from './EquationScene';
import { ExplodedViewScene } from './ExplodedViewScene';
import { FeedbackControlScene } from './FeedbackControlScene';
import { FlowScene } from './FlowScene';
import { FunnelScene } from './FunnelScene';
import { HeadlineScene } from './HeadlineScene';
import { HeroScene } from './HeroScene';
import { IcebergScene } from './IcebergScene';
import { JourneyScene } from './JourneyScene';
import { KeystoneScene } from './KeystoneScene';
import { LeverageScene } from './LeverageScene';
import { LoopScene } from './LoopScene';
import { MomentumScene } from './MomentumScene';
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
import { RelayScene } from './RelayScene';
import { RequestRoutingScene } from './RequestRoutingScene';
import { ResourceLeakScene } from './ResourceLeakScene';
import { RetrievalGroundingScene } from './RetrievalGroundingScene';
import { SearchScene } from './SearchScene';
import { SoftwareReleaseScene } from './SoftwareReleaseScene';
import { SpectrumScene } from './SpectrumScene';
import { StackScene } from './StackScene';
import { StairsScene } from './StairsScene';
import { StampScene } from './StampScene';
import { StatementScene } from './StatementScene';
import { StreakScene } from './StreakScene';
import { StudyScene } from './StudyScene';
import { SwitchyardScene } from './SwitchyardScene';
import { SynchronizationScene } from './SynchronizationScene';
import { SpatialSceneView } from './spatial/SpatialSceneView';
import { TimelineScene } from './TimelineScene';
import type { ExplainerScene } from './types';
import { VennScene } from './VennScene';
import { VersusScene } from './VersusScene';

export const SceneBody: React.FC<{ scene: ExplainerScene }> = ({ scene }) => {
  switch (scene.kind) {
    case 'system-layers':
    case 'semantic-sort':
    case 'information-transform':
      return <InformationSceneView scene={scene} />;
    case 'token-choice':
    case 'expert-selection':
    case 'edge-cloud':
      return <InferenceSceneView scene={scene} />;
    case 'resource-allocation':
    case 'market-exchange':
    case 'unit-economics':
      return <BusinessOperationsSceneView scene={scene} />;
    case 'population-distribution':
    case 'customer-cohort':
    case 'inventory-demand':
      return <BusinessPopulationsSceneView scene={scene} />;
    case 'scale-hierarchy':
    case 'possible-futures':
    case 'digital-twin':
      return <PerspectiveSceneView scene={scene} />;
    case 'collective-pattern':
    case 'robot-perception':
    case 'modular-machine':
      return <AdaptiveSceneView scene={scene} />;
    case 'house-cutaway':
    case 'house-build':
    case 'house-renovation':
    case 'property-access':
    case 'neighborhood':
    case 'floorplan-fit':
    case 'house-options':
    case 'property-lifecycle':
      return <SpatialSceneView scene={scene} />;
    case 'agent-team':
    case 'agent-plan':
    case 'agent-budget':
    case 'model-training':
    case 'model-evaluation':
    case 'evidence-conflict':
      return <CognitionSceneView scene={scene} />;
    case 'agent-workflow':
      return <AgentWorkflowScene scene={scene} />;
    case 'retrieval-grounding':
      return <RetrievalGroundingScene scene={scene} />;
    case 'context-window':
      return <ContextWindowScene scene={scene} />;
    case 'software-release':
      return <SoftwareReleaseScene scene={scene} />;
    case 'request-routing':
      return <RequestRoutingScene scene={scene} />;
    case 'synchronization':
      return <SynchronizationScene scene={scene} />;
    case 'relay':
      return <RelayScene scene={scene} />;
    case 'exploded-view':
      return <ExplodedViewScene scene={scene} />;
    case 'bottleneck':
      return <BottleneckScene scene={scene} />;
    case 'momentum':
      return <MomentumScene scene={scene} />;
    case 'leverage':
      return <LeverageScene scene={scene} />;
    case 'resource-leak':
      return <ResourceLeakScene scene={scene} />;
    case 'feedback-control':
      return <FeedbackControlScene scene={scene} />;
    case 'keystone':
      return <KeystoneScene scene={scene} />;
    case 'switchyard':
      return <SwitchyardScene scene={scene} />;
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
  const exhaustive: never = scene;
  return exhaustive;
};
