import { DEFAULT_PALETTE_ID } from '@shared/palettes';
import {
  DEFAULT_STORYBOARD_STYLE,
  normalizeStoryboardStyle,
  type StoryboardStyle,
} from '@shared/storyboards';
import type { LongformSkinId, Platform } from '@shared/types';
import { useSyncExternalStore } from 'react';
import { DEFAULT_TARGET_PLATFORM, DEFAULT_TEMPLATE_LAYOUT } from '@/store/helpers';
import type { ProjectCreatorProfile, TemplateLayout } from '@/store/types';

export type CreatorProfileFieldKey =
  | 'audience'
  | 'tone'
  | 'cta'
  | 'logo'
  | 'evidenceAssets'
  | 'references'
  | 'targetPlatform'
  | 'safeZone'
  | 'longformSkin'
  | 'longformPalette'
  | 'longformStoryboardStyle';

export interface CreatorProfile {
  id: string;
  name: string;
  audience: string;
  tone: string;
  callToAction: {
    text: string;
    url: string;
    assetPaths: string[];
  };
  logoPath: string | null;
  evidenceAssetPaths: string[];
  referenceLinks: string[];
  referenceAssetPaths: string[];
  targetPlatform: Platform;
  templateLayout: TemplateLayout;
  longformSkin: LongformSkinId;
  longformStoryboardStyle: StoryboardStyle;
  longformPaletteId: string;
  createdAt: string;
  updatedAt: string;
  fieldUpdatedAt: Partial<Record<CreatorProfileFieldKey, string>>;
}

export interface RememberedPreference {
  id: string;
  profileId: string;
  profileName: string;
  key: CreatorProfileFieldKey;
  label: string;
  value: string;
  source: string;
  scope: string;
  updatedAt: string;
}

interface CreatorProfileSnapshot {
  profiles: CreatorProfile[];
}

const STORAGE_KEY = 'batchclip.creator-profiles.v1';
const CHANNEL_NAME = 'batchclip-creator-profiles';
const EMPTY_SNAPSHOT: CreatorProfileSnapshot = { profiles: [] };
const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;
let listenersReady = false;
let snapshot = readSnapshot();

function nowIso(): string {
  return new Date().toISOString();
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function isPlatform(value: unknown): value is Platform {
  return value === 'tiktok' || value === 'reels' || value === 'shorts' || value === 'universal';
}

function isLongformSkin(value: unknown): value is LongformSkinId {
  return [
    'aurora-glass',
    'editorial',
    'bento',
    'terminal',
    'print-magazine',
    'neo-brutalist',
    'blueprint',
    'ezcoder',
  ].includes(String(value));
}

function normalizeProfile(value: Partial<CreatorProfile>): CreatorProfile {
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : nowIso();
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : createdAt;
  return {
    id: typeof value.id === 'string' && value.id ? value.id : crypto.randomUUID(),
    name: typeof value.name === 'string' && value.name.trim() ? value.name : 'Creator Profile',
    audience: typeof value.audience === 'string' ? value.audience : '',
    tone: typeof value.tone === 'string' ? value.tone : '',
    callToAction: {
      text: typeof value.callToAction?.text === 'string' ? value.callToAction.text : '',
      url: typeof value.callToAction?.url === 'string' ? value.callToAction.url : '',
      assetPaths: stringArray(value.callToAction?.assetPaths),
    },
    logoPath: typeof value.logoPath === 'string' && value.logoPath ? value.logoPath : null,
    evidenceAssetPaths: stringArray(value.evidenceAssetPaths),
    referenceLinks: stringArray(value.referenceLinks),
    referenceAssetPaths: stringArray(value.referenceAssetPaths),
    targetPlatform: isPlatform(value.targetPlatform)
      ? value.targetPlatform
      : DEFAULT_TARGET_PLATFORM,
    templateLayout: {
      titleText: {
        ...DEFAULT_TEMPLATE_LAYOUT.titleText,
        ...(value.templateLayout?.titleText ?? {}),
      },
      subtitles: {
        ...DEFAULT_TEMPLATE_LAYOUT.subtitles,
        ...(value.templateLayout?.subtitles ?? {}),
      },
    },
    longformSkin: isLongformSkin(value.longformSkin) ? value.longformSkin : 'editorial',
    longformStoryboardStyle: normalizeStoryboardStyle(value.longformStoryboardStyle),
    longformPaletteId:
      typeof value.longformPaletteId === 'string' && value.longformPaletteId
        ? value.longformPaletteId
        : DEFAULT_PALETTE_ID,
    createdAt,
    updatedAt,
    fieldUpdatedAt:
      value.fieldUpdatedAt && typeof value.fieldUpdatedAt === 'object' ? value.fieldUpdatedAt : {},
  };
}

function readSnapshot(): CreatorProfileSnapshot {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_SNAPSHOT;
    const parsed = JSON.parse(raw) as Partial<CreatorProfileSnapshot>;
    return {
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles.map(normalizeProfile) : [],
    };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

function emit(): void {
  listeners.forEach((listener) => {
    listener();
  });
}

function receive(next: CreatorProfileSnapshot): void {
  const normalized = {
    profiles: Array.isArray(next.profiles) ? next.profiles.map(normalizeProfile) : [],
  };
  if (JSON.stringify(normalized) === JSON.stringify(snapshot)) return;
  snapshot = normalized;
  emit();
}

function ensureCrossWindowListeners(): void {
  if (listenersReady) return;
  listenersReady = true;
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    try {
      receive(
        event.newValue ? (JSON.parse(event.newValue) as CreatorProfileSnapshot) : EMPTY_SNAPSHOT,
      );
    } catch {
      receive(EMPTY_SNAPSHOT);
    }
  });
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener('message', (event: MessageEvent<CreatorProfileSnapshot>) => {
      receive(event.data);
    });
  } catch {
    channel = null;
  }
}

function persist(next: CreatorProfileSnapshot): void {
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Keep the profile usable in this renderer when storage is unavailable.
  }
  channel?.postMessage(next);
  emit();
}

function subscribe(listener: () => void): () => void {
  ensureCrossWindowListeners();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCreatorProfiles(): CreatorProfile[] {
  return snapshot.profiles;
}

export function useCreatorProfiles(): CreatorProfile[] {
  return useSyncExternalStore(subscribe, getCreatorProfiles, getCreatorProfiles);
}

export function createCreatorProfile(name = 'Creator Profile'): CreatorProfile {
  ensureCrossWindowListeners();
  const profile = normalizeProfile({ id: crypto.randomUUID(), name });
  persist({ profiles: [...snapshot.profiles, profile] });
  return profile;
}

export function updateCreatorProfile(
  id: string,
  patch: Partial<CreatorProfile>,
  changedFields: CreatorProfileFieldKey[] = [],
): CreatorProfile | null {
  let updated: CreatorProfile | null = null;
  const profiles = snapshot.profiles.map((profile) => {
    if (profile.id !== id) return profile;
    const updatedAt = nowIso();
    updated = normalizeProfile({
      ...profile,
      ...patch,
      callToAction: patch.callToAction ?? profile.callToAction,
      templateLayout: patch.templateLayout ?? profile.templateLayout,
      updatedAt,
      fieldUpdatedAt: {
        ...(patch.fieldUpdatedAt ?? profile.fieldUpdatedAt),
        ...Object.fromEntries(changedFields.map((field) => [field, updatedAt])),
      },
    });
    return updated;
  });
  if (updated) persist({ profiles });
  return updated;
}

export function deleteCreatorProfile(id: string): void {
  persist({ profiles: snapshot.profiles.filter((profile) => profile.id !== id) });
}

/** Keep reusable defaults valid when a shared custom palette is deleted. */
export function resetCreatorProfilesUsingPalette(
  paletteId: string,
  fallbackId = DEFAULT_PALETTE_ID,
): void {
  const changedAt = nowIso();
  let changed = false;
  const profiles = snapshot.profiles.map((profile) => {
    if (profile.longformPaletteId !== paletteId) return profile;
    changed = true;
    return normalizeProfile({
      ...profile,
      longformPaletteId: fallbackId,
      updatedAt: changedAt,
      fieldUpdatedAt: { ...profile.fieldUpdatedAt, longformPalette: changedAt },
    });
  });
  if (changed) persist({ profiles });
}

function preferenceValue(profile: CreatorProfile, key: CreatorProfileFieldKey): string {
  switch (key) {
    case 'audience':
      return profile.audience;
    case 'tone':
      return profile.tone;
    case 'cta':
      return [profile.callToAction.text, profile.callToAction.url].filter(Boolean).join(' · ');
    case 'logo':
      return profile.logoPath ?? '';
    case 'evidenceAssets':
      return profile.evidenceAssetPaths.length
        ? `${profile.evidenceAssetPaths.length} evidence/capture asset${profile.evidenceAssetPaths.length === 1 ? '' : 's'}`
        : '';
    case 'references': {
      const count = profile.referenceLinks.length + profile.referenceAssetPaths.length;
      return count ? `${count} reference${count === 1 ? '' : 's'}` : '';
    }
    case 'targetPlatform':
      return profile.targetPlatform;
    case 'safeZone':
      return `Title ${profile.templateLayout.titleText.x}%, ${profile.templateLayout.titleText.y}% · Captions ${profile.templateLayout.subtitles.x}%, ${profile.templateLayout.subtitles.y}%`;
    case 'longformSkin':
      return profile.longformSkin;
    case 'longformPalette':
      return profile.longformPaletteId;
    case 'longformStoryboardStyle':
      return profile.longformStoryboardStyle;
  }
}

const PREFERENCE_LABELS: Record<CreatorProfileFieldKey, string> = {
  audience: 'Target audience',
  tone: 'Tone',
  cta: 'CTA default',
  logo: 'Logo',
  evidenceAssets: 'Promo evidence assets',
  references: 'Creative references',
  targetPlatform: 'Target platform',
  safeZone: 'Safe-zone layout',
  longformSkin: 'Long-form skin',
  longformPalette: 'Long-form palette',
  longformStoryboardStyle: 'Storyboard style',
};

export function buildCreatorProfileGuidance(project: ProjectCreatorProfile): string {
  const profile = snapshot.profiles.find((item) => item.id === project.profileId);
  if (!profile) return '';
  const audience = project.overrides.audience ?? profile.audience;
  const tone = project.overrides.tone ?? profile.tone;
  const callToAction = project.overrides.callToAction ?? profile.callToAction.text;
  return [
    audience.trim() ? `TARGET AUDIENCE:\n${audience.trim()}` : '',
    tone.trim() ? `TONE:\n${tone.trim()}` : '',
    callToAction.trim() ? `CALL TO ACTION:\n${callToAction.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function listRememberedPreferences(profiles = snapshot.profiles): RememberedPreference[] {
  return profiles.flatMap((profile) =>
    (Object.keys(PREFERENCE_LABELS) as CreatorProfileFieldKey[]).flatMap((key) => {
      if (!profile.fieldUpdatedAt[key]) return [];
      const value = preferenceValue(profile, key).trim();
      if (!value) return [];
      return [
        {
          id: `${profile.id}:${key}`,
          profileId: profile.id,
          profileName: profile.name,
          key,
          label: PREFERENCE_LABELS[key],
          value,
          source: `Saved in ${profile.name}`,
          scope: 'Reusable across projects',
          updatedAt: profile.fieldUpdatedAt[key] ?? profile.updatedAt,
        },
      ];
    }),
  );
}

export function deleteRememberedPreference(profileId: string, key: CreatorProfileFieldKey): void {
  const profile = snapshot.profiles.find((item) => item.id === profileId);
  if (!profile) return;
  switch (key) {
    case 'audience':
      updateCreatorProfile(profileId, { audience: '' }, [key]);
      break;
    case 'tone':
      updateCreatorProfile(profileId, { tone: '' }, [key]);
      break;
    case 'cta':
      updateCreatorProfile(profileId, { callToAction: { text: '', url: '', assetPaths: [] } }, [
        key,
      ]);
      break;
    case 'logo':
      updateCreatorProfile(profileId, { logoPath: null }, [key]);
      break;
    case 'evidenceAssets':
      updateCreatorProfile(profileId, { evidenceAssetPaths: [] }, [key]);
      break;
    case 'references':
      updateCreatorProfile(profileId, { referenceLinks: [], referenceAssetPaths: [] }, [key]);
      break;
    case 'targetPlatform':
      updateCreatorProfile(profileId, { targetPlatform: DEFAULT_TARGET_PLATFORM }, [key]);
      break;
    case 'safeZone':
      updateCreatorProfile(profileId, { templateLayout: DEFAULT_TEMPLATE_LAYOUT }, [key]);
      break;
    case 'longformSkin':
      updateCreatorProfile(profileId, { longformSkin: 'editorial' }, [key]);
      break;
    case 'longformPalette':
      updateCreatorProfile(profileId, { longformPaletteId: DEFAULT_PALETTE_ID }, [key]);
      break;
    case 'longformStoryboardStyle':
      updateCreatorProfile(profileId, { longformStoryboardStyle: DEFAULT_STORYBOARD_STYLE }, [key]);
      break;
  }
  const updatedProfile = snapshot.profiles.find((item) => item.id === profileId);
  if (!updatedProfile) return;
  const fieldUpdatedAt = { ...updatedProfile.fieldUpdatedAt };
  delete fieldUpdatedAt[key];
  updateCreatorProfile(profileId, { fieldUpdatedAt }, []);
}
