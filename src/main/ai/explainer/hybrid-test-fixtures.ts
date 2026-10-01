import {
  DETROIT_CATALOG,
  getDetroitLandmark,
} from '../../remotion/compositions/explainer/detroit/catalog';
import { hybridFixture } from './hybrid-fixture';

export function detroitFixture(
  preset = 'landmark-focus',
  visualMode = 'hybrid',
  id = 'renaissance-center',
) {
  const landmark = preset === 'market-block' ? 'eastern-market' : id;
  const name = getDetroitLandmark(landmark)?.label;
  if (!name) throw new Error('Unknown fixture landmark');
  return hybridFixture(
    [
      `Detroit includes the ${name}. ${preset === 'city-portrait' ? 'Michigan Central Station and Fox Theatre give this portrait identity.' : 'This architectural portrait has a clear subject.'}`,
      `The ${name} reveals its distinctive massing.`,
      'The authored diagram keeps the same recognizable silhouette.',
      'These labels identify the landmarks in this schematic city portrait.',
      'A recognizable skyline gives the city its identity.',
    ],
    {
      kind: 'detroit-place',
      preset,
      visualMode,
      label: name,
      subject: 'Detroit',
      outcome: 'A recognizable skyline',
      evidence: 'source-stated',
      landmarks:
        preset === 'city-portrait'
          ? ['renaissance-center', 'michigan-central', 'fox-theatre']
          : [landmark],
    },
  );
}

export function allHybridFixtures(): { name: string; fixture: ReturnType<typeof hybridFixture> }[] {
  return ['diagram', 'hybrid'].flatMap((mode) => [
    ...DETROIT_CATALOG.map((entry) => ({
      name: `detroit-${entry.id}-${mode}`,
      fixture: detroitFixture('landmark-focus', mode, entry.id),
    })),
    ...['city-portrait', 'market-block'].map((preset) => ({
      name: `detroit-${preset}-${mode}`,
      fixture: detroitFixture(preset, mode),
    })),
    ...['capital-deployment', 'proceeds-distribution'].map((preset) => ({
      name: `fund-${preset}-${mode}`,
      fixture: fundFixture(preset, mode),
    })),
    ...['share-issue', 'stake-value-separation'].map((preset) => ({
      name: `ownership-${preset}-${mode}`,
      fixture: ownershipFixture(preset, mode),
    })),
    ...['shared-holdings', 'shared-driver'].map((preset) => ({
      name: `portfolio-${preset}-${mode}`,
      fixture: portfolioFixture(preset, mode),
    })),
    ...['receivable-gap', 'inventory-before-sales'].map((preset) => ({
      name: `cash-${preset}-${mode}`,
      fixture: cashFixture(preset, mode),
    })),
    ...['reference-link', 'context-link'].map((preset) => ({
      name: `attention-${preset}-${mode}`,
      fixture: attentionFixture(preset, mode),
    })),
    ...['measured-comparison', 'constraint-choice'].map((preset) => ({
      name: `tradeoff-${preset}-${mode}`,
      fixture: tradeoffFixture(preset, mode),
    })),
  ]);
}

export function tradeoffFixture(preset = 'measured-comparison', visualMode = 'hybrid') {
  const metric = (kind: string, unit: string, a: number, b: number) => ({
    kind,
    unit,
    values: [
      { modelId: 'a', measurement: { state: 'measured', value: a, unit } },
      { modelId: 'b', measurement: { state: 'measured', value: b, unit } },
    ],
  });
  return hybridFixture(
    [
      'Model tradeoffs are illustrative for Model A and Model B. Both models run sorting on one test.',
      'Model A cost is 2 USD/task. Model B cost is 1 USD/task.',
      'Model A latency is 100 ms/task. Model B latency is 200 ms/task.',
      'Model A score is 90 score/100. Model B score is 80 score/100.',
      preset === 'constraint-choice'
        ? 'Model B fits the 1 USD/task budget for sorting. Model B fits the stated budget.'
        : 'No universal winner. Tradeoffs depend on the task.',
    ],
    {
      kind: 'inference-tradeoff',
      preset,
      visualMode,
      label: 'Model tradeoffs',
      subject: 'Model A',
      outcome:
        preset === 'constraint-choice' ? 'Model B fits the stated budget' : 'No universal winner',
      evidence: 'illustrative',
      models: [
        { id: 'a', label: 'Model A' },
        { id: 'b', label: 'Model B' },
      ],
      task: 'sorting',
      basis: 'one test',
      metrics: [
        metric('cost', 'USD/task', 2, 1),
        metric('latency', 'ms/task', 100, 200),
        metric('score', 'score/100', 90, 80),
      ],
      ...(preset === 'constraint-choice'
        ? { constraint: { metric: 'cost', maximum: 1, unit: 'USD/task', selectedId: 'b' } }
        : {}),
    },
  );
}

export function attentionFixture(preset = 'reference-link', visualMode = 'hybrid') {
  return hybridFixture(
    [
      'Word attention is illustrative. Maya opened her shop. It sells bread.',
      'Select It as the target.',
      preset === 'reference-link'
        ? 'It refers to shop in this illustration.'
        : 'It uses shop as context in this illustration.',
      'This illustrated relationship has no measured attention weights.',
      'Words use earlier context. The link supplies context.',
    ],
    {
      kind: 'token-attention',
      preset,
      visualMode,
      label: 'Word attention',
      subject: 'Maya',
      outcome: 'Words use earlier context',
      evidence: 'illustrative',
      sentence: 'Maya opened her shop. It sells bread.',
      targetIndex: 4,
      contextIndex: 3,
    },
  );
}

export function cashFixture(preset = 'receivable-gap', visualMode = 'hybrid') {
  return hybridFixture(
    [
      'Profit versus cash follows Shop in an illustrative example. Shop records sales of 100 USD. Shop has total costs of 70 USD.',
      `Shop pays 70 USD ${preset === 'receivable-gap' ? 'in costs' : 'for inventory'} today.`,
      'Customer pays 100 USD to Shop next month.',
      'Shop records profit of 30 USD.',
      'Payment arrives later. Cash and profit have different timing.',
    ],
    {
      kind: 'cash-timing',
      preset,
      visualMode,
      label: 'Profit versus cash',
      subject: 'Shop',
      outcome: 'Payment arrives later',
      evidence: 'illustrative',
      business: { id: 'shop', label: 'Shop' },
      customer: { id: 'customer', label: 'Customer' },
      sales: { minorUnits: 10000, currency: 'USD' },
      totalCosts: { minorUnits: 7000, currency: 'USD' },
      cashPaid: { minorUnits: 7000, currency: 'USD' },
      profitMinor: 3000,
      paidWhen: 'today',
      receivedWhen: 'next month',
    },
  );
}

export function portfolioFixture(preset = 'shared-holdings', visualMode = 'hybrid') {
  const driver = preset === 'shared-driver';
  const exposure = { id: 'exposure', label: driver ? 'interest rates' : 'ExampleCo' };
  return hybridFixture(
    [
      'An illustrative portfolio exposure example follows Fund A and Fund B.',
      `Fund A ${driver ? 'is exposed to' : 'holds'} ${exposure.label}. Fund B ${driver ? 'depends on' : 'owns'} ${exposure.label}.`,
      `${exposure.label} is shared by both funds in this example.`,
      'Other exposure is not stated and the fund names remain distinct.',
      'Shared exposure remains visible despite the different fund names.',
    ],
    {
      kind: 'portfolio-exposure',
      preset,
      visualMode,
      label: 'portfolio exposure',
      subject: 'Fund A',
      outcome: 'Shared exposure',
      evidence: 'illustrative',
      funds: [
        { id: 'fund-a', label: 'Fund A' },
        { id: 'fund-b', label: 'Fund B' },
      ],
      exposure,
      holdings: driver
        ? []
        : [
            { fundId: 'fund-a', holding: exposure },
            { fundId: 'fund-b', holding: exposure },
          ],
    },
  );
}

export function ownershipFixture(preset = 'share-issue', visualMode = 'hybrid') {
  return hybridFixture(
    [
      'An illustrative dilution example follows ExampleCo. Ada owns 40 of 100 shares in ExampleCo. Ada owns 40 percent of ExampleCo.',
      'ExampleCo issues 100 new shares.',
      'Ada keeps 40 of 200 shares in ExampleCo.',
      'Ada now owns 20 percent of ExampleCo. Value is not stated.',
      'Share count stays the same. Percentage and value are different.',
    ],
    {
      kind: 'ownership-change',
      preset,
      visualMode,
      label: 'dilution',
      subject: 'ExampleCo',
      outcome: 'Share count stays the same',
      evidence: 'illustrative',
      holder: { id: 'ada', label: 'Ada' },
      company: { id: 'co', label: 'ExampleCo' },
      shares: 40,
      beforeTotal: 100,
      issued: 100,
      afterTotal: 200,
      beforePercent: 40,
      afterPercent: 20,
      valuation: { state: 'unknown' },
    },
  );
}

export function fundFixture(
  preset = 'capital-deployment',
  visualMode = 'hybrid',
  quantitative = true,
) {
  const distribution = preset === 'proceeds-distribution';
  const first = distribution ? 'Shop' : 'Ada',
    second = distribution ? 'Maker' : 'Bo';
  const targetA = distribution ? 'Ada' : 'Shop',
    targetB = distribution ? 'Bo' : 'Maker';
  const amount = (minorUnits: number) =>
    quantitative
      ? { state: 'measured', money: { minorUnits, currency: 'USD' } }
      : { state: 'qualitative' };
  const quantity = (value: number) =>
    quantitative ? `${value} USD` : distribution ? 'proceeds' : 'capital';
  return hybridFixture(
    [
      'Fund flows follow Atlas Fund during this round in an illustrative example.',
      `${first} ${distribution ? 'pays' : 'contributes'} ${quantity(60)} to Atlas Fund. ${second} ${distribution ? 'pays' : 'contributes'} ${quantity(40)} to Atlas Fund.`,
      `Atlas Fund ${distribution ? 'distributes' : 'deploys'} ${quantity(70)} to ${targetA}. Atlas Fund ${distribution ? 'distributes' : 'deploys'} ${quantity(30)} to ${targetB}.`,
      'The stated transfers retain their direction and identity during this round.',
      `${distribution ? 'Proceeds reach investors' : 'Capital reaches investments'}. Money follows the stated paths.`,
    ],
    {
      kind: 'fund-flow',
      preset,
      visualMode,
      label: 'Fund flows',
      subject: 'Atlas Fund',
      evidence: 'illustrative',
      outcome: distribution ? 'Proceeds reach investors' : 'Capital reaches investments',
      period: 'this round',
      account: { id: 'fund', label: 'Atlas Fund' },
      sources: [
        { id: 'first', label: first },
        { id: 'second', label: second },
      ],
      targets: [
        { id: 'target-a', label: targetA },
        { id: 'target-b', label: targetB },
      ],
      contributions: [
        { from: 'first', to: 'fund', amount: amount(6000) },
        { from: 'second', to: 'fund', amount: amount(4000) },
      ],
      deployments: [
        { from: 'fund', to: 'target-a', amount: amount(7000) },
        { from: 'fund', to: 'target-b', amount: amount(3000) },
      ],
    },
  );
}
