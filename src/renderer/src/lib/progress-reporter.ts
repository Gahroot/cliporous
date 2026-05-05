import type { PipelineProgress, PipelineStage } from '../store'

type PipelineSetter = (progress: PipelineProgress) => void

/** Scoped reporter for a single pipeline stage — eliminates repetitive stage name passing. */
export interface StageReporter {
  /** Signal that the stage has started (sets percent to 0). */
  start(message: string): void
  /** Update progress mid-stage. */
  update(message: string, percent?: number): void
  /** Signal that the stage is complete (sets percent to 100). */
  done(message?: string): void
}

/** Create a progress reporter scoped to a single pipeline stage. */
export function createStageReporter(
  setPipeline: PipelineSetter,
  stage: PipelineStage
): StageReporter {
  return {
    start: (message) => setPipeline({ stage, message, percent: 0 }),
    update: (message, percent) => setPipeline({ stage, message, percent: percent ?? 0 }),
    done: (message) =>
      setPipeline({ stage, message: message ?? `${stage} complete`, percent: 100 })
  }
}
