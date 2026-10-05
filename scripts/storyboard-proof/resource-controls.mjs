/** Authored schedule, NOT measurements. All work is serial in the existing owned worker. */
export function resourceComparisonPlan() {
  return {
    executed: false,
    cycles: 5,
    coldDefinition: 'First export after each fresh proof worker launch; not OS/GPU cache eviction.',
    warmDefinition:
      'Repeat in the same worker; production renderer retains its existing browser teardown policy.',
    sampler:
      'Existing startProcessMetrics(exact spawned PID) + startMetrics(owned scratch); no GPU memory measurement.',
    controls: [
      'historical-moving',
      'historical-max-source',
      'business-representative',
      'business-max-source',
    ],
    jobs: Array.from({ length: 5 }, (_, cycle) =>
      [
        'historical-moving',
        'historical-max-source',
        'business-representative',
        'business-max-source',
      ].flatMap((control) =>
        ['cold', 'warm'].map((phase) => ({
          cycle: cycle + 1,
          control,
          phase,
          style: 'ink',
          paletteIndex: 0,
        })),
      ),
    ),
    limitation:
      'Cold labels identify first-use per control/cycle, not isolated cold OS caches. For fresh-process cold comparison launch five separate --resource-cycles runs; compare only on the same machine/build/pin. Settled growth needs human investigation, not an automatic leak-free assertion.',
  };
}
