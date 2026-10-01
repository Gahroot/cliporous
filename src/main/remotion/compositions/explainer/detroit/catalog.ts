import type { DetroitLandmarkId, LandmarkDefinition } from './types';

/** React-free selection metadata; entries added only with both actual representations. */
export const DETROIT_CATALOG: readonly LandmarkDefinition[] = [
  {
    id: 'renaissance-center',
    label: 'Renaissance Center',
    aliases: ['renaissance center', 'rencen', 'ren cen'],
    recognition: [
      'central-cylinder',
      'four-octagonal-office-towers',
      'slim-circulation-cores',
      'two-rectangular-east-towers',
      'connected-podium-and-wintergarden',
    ],
    meshCeiling: 56,
    provenance: 'authored-architectural-massing',
  },
  {
    id: 'michigan-central',
    label: 'Michigan Central Station',
    aliases: ['michigan central station', 'michigan central'],
    recognition: ['long-classical-base', 'tall-office-block', 'restored-facade'],
    meshCeiling: 32,
    provenance: 'authored-architectural-massing',
  },
  {
    id: 'fox-theatre',
    label: 'Fox Theatre',
    aliases: ['fox theatre', 'fox theater', 'detroit fox'],
    recognition: ['street-facing-facade', 'projecting-marquee', 'authored-fox-lettering'],
    meshCeiling: 32,
    provenance: 'authored-architectural-massing',
  },
  {
    id: 'guardian-building',
    label: 'Guardian Building',
    aliases: ['guardian building'],
    recognition: ['stepped-art-deco', 'geometric-entrance'],
    meshCeiling: 18,
    provenance: 'authored-architectural-massing',
  },
  {
    id: 'penobscot-building',
    label: 'Penobscot Building',
    aliases: ['penobscot building', 'penobscot tower'],
    recognition: ['stepped-crown', 'mast'],
    meshCeiling: 18,
    provenance: 'authored-architectural-massing',
  },
  {
    id: 'ambassador-bridge',
    label: 'Ambassador Bridge',
    aliases: ['ambassador bridge'],
    recognition: ['suspension-towers', 'main-cable', 'river-deck'],
    meshCeiling: 60,
    provenance: 'authored-architectural-massing',
  },
  {
    id: 'eastern-market',
    label: 'Eastern Market',
    aliases: ['eastern market'],
    recognition: ['pitched-market-shed', 'authored-stalls'],
    meshCeiling: 24,
    provenance: 'authored-architectural-massing',
  },
];

export function getDetroitLandmark(value: unknown): LandmarkDefinition | undefined {
  return DETROIT_CATALOG.find((entry) => entry.id === value);
}
export function namedDetroitLandmarks(source: string): DetroitLandmarkId[] {
  const normalized = ` ${source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
  return DETROIT_CATALOG.filter((entry) =>
    entry.aliases.some((alias) => normalized.includes(` ${alias} `)),
  ).map((entry) => entry.id);
}
