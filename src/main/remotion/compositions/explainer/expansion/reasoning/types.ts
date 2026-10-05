import type { ExpansionReasoningArgumentScene } from './argument-types';
import type { ExpansionReasoningInformationScene } from './information-types';
import type { ExpansionReasoningScopeScene } from './scope-types';
import type { ReasoningTraceScene } from './trace-types';

/** Local source-validated union. Runtime registration waits for both real views and fixtures. */
export type ExpansionReasoningScene =
  | ReasoningTraceScene
  | ExpansionReasoningArgumentScene
  | ExpansionReasoningInformationScene
  | ExpansionReasoningScopeScene;
