export interface ResourceComparisonPlan {
  executed: false;
  cycles: 5;
  coldDefinition: string;
  warmDefinition: string;
  sampler: string;
  controls: string[];
  jobs: { cycle: number; control: string; phase: string; style: string; paletteIndex: number }[][];
  limitation: string;
}
export function resourceComparisonPlan(): ResourceComparisonPlan;
