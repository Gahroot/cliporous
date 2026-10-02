import { BUILTIN_PALETTES } from '@shared/palettes';
import { DEFAULT_STORYBOARD_STYLE, type StoryboardStyle } from '@shared/storyboards';
import type { LongformSkinId, Platform } from '@shared/types';
import {
  CircleUserRound,
  CopyCheck,
  HeartPulse,
  LockKeyhole,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { LongformAppearancePicker } from '@/components/LongformAppearancePicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  type CreatorProfile,
  type CreatorProfileFieldKey,
  createCreatorProfile,
  deleteCreatorProfile,
  deleteRememberedPreference,
  listRememberedPreferences,
  updateCreatorProfile,
  useCreatorProfiles,
} from '@/services/creator-profiles';
import { useStore } from '@/store';
import type { ProjectCreatorProfile, TemplateLayout } from '@/store/types';
import { CreatorAssetField } from './CreatorAssetField';

interface CreatorProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ProfileTab = 'profiles' | 'project' | 'memory';

const TEXTAREA_CLASS =
  'flex min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const PLATFORM_LABELS: Record<Platform, string> = {
  universal: 'Universal safe zone',
  tiktok: 'TikTok',
  reels: 'Instagram Reels',
  shorts: 'YouTube Shorts',
};

function formatUpdated(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function profileAssetPaths(profile: CreatorProfile): string[] {
  return [
    ...(profile.logoPath ? [profile.logoPath] : []),
    ...profile.callToAction.assetPaths,
    ...profile.evidenceAssetPaths,
    ...profile.referenceAssetPaths,
  ];
}

function ProfileField({
  label,
  htmlFor,
  children,
  description,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  description?: string;
}): React.JSX.Element {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}

function SafeZoneFields({
  value,
  onChange,
}: {
  value: TemplateLayout;
  onChange: (value: TemplateLayout) => void;
}): React.JSX.Element {
  const update = (section: keyof TemplateLayout, axis: 'x' | 'y', raw: string): void => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onChange({
      ...value,
      [section]: { ...value[section], [axis]: Math.min(100, Math.max(0, parsed)) },
    });
  };

  return (
    <fieldset className="grid gap-3 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium">Safe-zone layout</legend>
      <p className="text-xs text-muted-foreground">
        Default title and caption centers as percentages of the vertical canvas.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['titleText', 'subtitles'] as const).map((section) => (
          <div key={section} className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor={`${section}-x`} className="text-xs">
                {section === 'titleText' ? 'Title X' : 'Captions X'}
              </Label>
              <Input
                id={`${section}-x`}
                type="number"
                min={0}
                max={100}
                value={value[section].x}
                onChange={(event) => update(section, 'x', event.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`${section}-y`} className="text-xs">
                {section === 'titleText' ? 'Title Y' : 'Captions Y'}
              </Label>
              <Input
                id={`${section}-y`}
                type="number"
                min={0}
                max={100}
                value={value[section].y}
                onChange={(event) => update(section, 'y', event.target.value)}
              />
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

export function CreatorProfileDialog({
  open,
  onOpenChange,
}: CreatorProfileDialogProps): React.JSX.Element {
  const profiles = useCreatorProfiles();
  const projectProfile = useStore((state) => state.creatorProfile);
  const setCreatorProfile = useStore((state) => state.setCreatorProfile);
  const setCreatorProfileOverride = useStore((state) => state.setCreatorProfileOverride);
  const clearCreatorProfileOverride = useStore((state) => state.clearCreatorProfileOverride);
  const clearCreatorProfileOverrides = useStore((state) => state.clearCreatorProfileOverrides);
  const setProcessingConfig = useStore((state) => state.setProcessingConfig);
  const setTargetPlatform = useStore((state) => state.setTargetPlatform);
  const setTemplateLayout = useStore((state) => state.setTemplateLayout);
  const setLongformSkin = useStore((state) => state.setLongformSkin);
  const setLongformPaletteId = useStore((state) => state.setLongformPaletteId);
  const setLongformStoryboardStyle = useStore((state) => state.setLongformStoryboardStyle);
  const customPalettes = useStore((state) => state.settings.customPalettes);
  const [activeTab, setActiveTab] = useState<ProfileTab>('profiles');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [missingPaths, setMissingPaths] = useState<ReadonlySet<string>>(new Set());
  const [healthLoading, setHealthLoading] = useState(false);

  const selectedProfile =
    profiles.find((profile) => profile.id === selectedId) ?? profiles[0] ?? null;
  const appliedProfile =
    profiles.find((profile) => profile.id === projectProfile.profileId) ?? null;
  const preferences = useMemo(() => listRememberedPreferences(profiles), [profiles]);
  const allPalettes = useMemo(() => [...BUILTIN_PALETTES, ...customPalettes], [customPalettes]);
  const selectedProfileId = selectedProfile?.id ?? null;
  const selectedAssetPaths = selectedProfile ? profileAssetPaths(selectedProfile) : [];
  const assetHealthKey = JSON.stringify(selectedAssetPaths);

  useEffect(() => {
    if (open && selectedProfileId) setSelectedId(selectedProfileId);
  }, [open, selectedProfileId]);

  useEffect(() => {
    let cancelled = false;
    const paths = JSON.parse(assetHealthKey) as string[];
    if (paths.length === 0) {
      setMissingPaths(new Set());
      return;
    }
    setHealthLoading(true);
    void window.api
      .checkCreatorAssets(paths)
      .then((result) => {
        if (!cancelled) {
          setMissingPaths(new Set(result.filter((item) => !item.exists).map((item) => item.path)));
        }
      })
      .catch(() => {
        if (!cancelled) setMissingPaths(new Set(paths));
      })
      .finally(() => {
        if (!cancelled) setHealthLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assetHealthKey]);

  const createProfile = (): void => {
    const profile = createCreatorProfile(`Creator Profile ${profiles.length + 1}`);
    setSelectedId(profile.id);
    setActiveTab('profiles');
  };

  const removeProfile = (profile: CreatorProfile): void => {
    if (
      !window.confirm(
        `Delete ${profile.name}? Projects using it keep their project overrides but lose reusable defaults.`,
      )
    ) {
      return;
    }
    deleteCreatorProfile(profile.id);
    if (projectProfile.profileId === profile.id) setCreatorProfile(null);
    setSelectedId(profiles.find((item) => item.id !== profile.id)?.id ?? null);
  };

  const updateSelected = (
    patch: Partial<CreatorProfile>,
    fields: CreatorProfileFieldKey[],
  ): void => {
    if (!selectedProfile) return;
    updateCreatorProfile(selectedProfile.id, patch, fields);
  };

  const applyProfile = (profileId: string | null): void => {
    const profile = profiles.find((item) => item.id === profileId) ?? null;
    setCreatorProfile(profile?.id ?? null);
    if (!profile) return;
    setProcessingConfig({ targetAudience: profile.audience });
    setTargetPlatform(profile.targetPlatform);
    setTemplateLayout(profile.templateLayout);
    setLongformSkin(profile.longformSkin);
    setLongformStoryboardStyle(profile.longformStoryboardStyle ?? DEFAULT_STORYBOARD_STYLE);
    setLongformPaletteId(profile.longformPaletteId);
  };

  const setProjectOverride = <K extends keyof ProjectCreatorProfile['overrides']>(
    key: K,
    value: ProjectCreatorProfile['overrides'][K],
  ): void => {
    setCreatorProfileOverride(key, value);
    if (key === 'audience' && typeof value === 'string')
      setProcessingConfig({ targetAudience: value });
    if (key === 'targetPlatform' && typeof value === 'string') setTargetPlatform(value as Platform);
    if (key === 'templateLayout' && value && typeof value === 'object') {
      setTemplateLayout(value as TemplateLayout);
    }
    if (key === 'longformSkin' && typeof value === 'string')
      setLongformSkin(value as LongformSkinId);
    if (key === 'longformPaletteId' && typeof value === 'string') setLongformPaletteId(value);
    if (key === 'longformStoryboardStyle' && typeof value === 'string')
      setLongformStoryboardStyle(value as StoryboardStyle);
  };

  const clearOverride = (key: keyof ProjectCreatorProfile['overrides']): void => {
    clearCreatorProfileOverride(key);
    if (!appliedProfile) return;
    if (key === 'audience') setProcessingConfig({ targetAudience: appliedProfile.audience });
    if (key === 'targetPlatform') setTargetPlatform(appliedProfile.targetPlatform);
    if (key === 'templateLayout') setTemplateLayout(appliedProfile.templateLayout);
    if (key === 'longformSkin') setLongformSkin(appliedProfile.longformSkin);
    if (key === 'longformStoryboardStyle')
      setLongformStoryboardStyle(appliedProfile.longformStoryboardStyle);
    if (key === 'longformPaletteId') setLongformPaletteId(appliedProfile.longformPaletteId);
  };

  const clearAllOverrides = (): void => {
    clearCreatorProfileOverrides();
    if (appliedProfile) {
      setProcessingConfig({ targetAudience: appliedProfile.audience });
      setTargetPlatform(appliedProfile.targetPlatform);
      setTemplateLayout(appliedProfile.templateLayout);
      setLongformSkin(appliedProfile.longformSkin);
      setLongformStoryboardStyle(appliedProfile.longformStoryboardStyle);
      setLongformPaletteId(appliedProfile.longformPaletteId);
    }
  };

  const editPreference = (profileId: string): void => {
    setSelectedId(profileId);
    setActiveTab('profiles');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(820px,calc(100vh-1rem))] max-w-5xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 pb-4 pt-5 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <CircleUserRound className="h-5 w-5 text-primary" aria-hidden />
            Creator Profile and Brand Kit
          </DialogTitle>
          <DialogDescription>
            Brand Kit edits update reusable profiles on this device. Project overrides do not edit
            the profile.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ProfileTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b border-border px-5 py-2">
            <TabsList className="grid h-auto w-full grid-cols-3">
              <TabsTrigger value="profiles">Brand Kit</TabsTrigger>
              <TabsTrigger value="project">Project defaults</TabsTrigger>
              <TabsTrigger value="memory">Remembered</TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            <TabsContent value="profiles" className="mt-4">
              {profiles.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 text-center">
                  <CircleUserRound className="h-7 w-7 text-muted-foreground" aria-hidden />
                  <div>
                    <h3 className="font-medium">No reusable profile yet</h3>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">
                      Create one place for audience, tone, CTA assets, references, platform, and
                      long-form defaults.
                    </p>
                  </div>
                  <Button type="button" onClick={createProfile}>
                    <Plus className="h-4 w-4" aria-hidden />
                    Create profile
                  </Button>
                </div>
              ) : (
                <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
                  <aside className="grid content-start gap-2" aria-label="Creator profiles">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">Profiles</h3>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-9 w-9"
                        aria-label="Create profile"
                        onClick={createProfile}
                      >
                        <Plus className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                    {profiles.map((profile) => (
                      <button
                        key={profile.id}
                        type="button"
                        aria-pressed={selectedProfile?.id === profile.id}
                        onClick={() => setSelectedId(profile.id)}
                        className={`rounded-md border px-3 py-2 text-left transition-[background-color,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          selectedProfile?.id === profile.id
                            ? 'border-primary bg-primary/8'
                            : 'border-border hover:bg-muted/60'
                        }`}
                      >
                        <span className="block truncate text-sm font-medium">{profile.name}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Updated {formatUpdated(profile.updatedAt)}
                        </span>
                      </button>
                    ))}
                  </aside>

                  {selectedProfile && (
                    <div className="grid min-w-0 gap-5">
                      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4">
                        <div className="min-w-0 flex-1">
                          <Label htmlFor="profile-name">Profile name</Label>
                          <Input
                            id="profile-name"
                            className="mt-1.5"
                            value={selectedProfile.name}
                            onChange={(event) => updateSelected({ name: event.target.value }, [])}
                          />
                          <p className="mt-1.5 text-xs text-muted-foreground" role="status">
                            Profile edits save automatically for reuse across projects.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          onClick={() => removeProfile(selectedProfile)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                          Delete profile
                        </Button>
                      </div>

                      <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
                        <div>
                          <h3 className="font-semibold">Audience and voice</h3>
                          <p className="text-xs text-muted-foreground">
                            Defaults that shape creator guidance across projects.
                          </p>
                        </div>
                        <ProfileField label="Target audience" htmlFor="profile-audience">
                          <textarea
                            id="profile-audience"
                            rows={3}
                            className={TEXTAREA_CLASS}
                            value={selectedProfile.audience}
                            placeholder="Who should this creator consistently reach?"
                            onChange={(event) =>
                              updateSelected({ audience: event.target.value }, ['audience'])
                            }
                          />
                        </ProfileField>
                        <ProfileField label="Tone" htmlFor="profile-tone">
                          <textarea
                            id="profile-tone"
                            rows={3}
                            className={TEXTAREA_CLASS}
                            value={selectedProfile.tone}
                            placeholder="Direct, warm, evidence-led, concise"
                            onChange={(event) =>
                              updateSelected({ tone: event.target.value }, ['tone'])
                            }
                          />
                        </ProfileField>
                      </section>

                      <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
                        <div>
                          <h3 className="font-semibold">Calls to action</h3>
                          <p className="text-xs text-muted-foreground">
                            Default CTA copy, destination, and reusable visual assets.
                          </p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <ProfileField label="CTA text" htmlFor="profile-cta-text">
                            <Input
                              id="profile-cta-text"
                              value={selectedProfile.callToAction.text}
                              placeholder="Join the creator community"
                              onChange={(event) =>
                                updateSelected(
                                  {
                                    callToAction: {
                                      ...selectedProfile.callToAction,
                                      text: event.target.value,
                                    },
                                  },
                                  ['cta'],
                                )
                              }
                            />
                          </ProfileField>
                          <ProfileField label="CTA URL" htmlFor="profile-cta-url">
                            <Input
                              id="profile-cta-url"
                              type="url"
                              value={selectedProfile.callToAction.url}
                              placeholder="https://example.com/join"
                              onChange={(event) =>
                                updateSelected(
                                  {
                                    callToAction: {
                                      ...selectedProfile.callToAction,
                                      url: event.target.value,
                                    },
                                  },
                                  ['cta'],
                                )
                              }
                            />
                          </ProfileField>
                        </div>
                        <CreatorAssetField
                          label="CTA assets"
                          description="End cards, QR captures, or short bumper videos."
                          kind="cta"
                          paths={selectedProfile.callToAction.assetPaths}
                          missingPaths={missingPaths}
                          onChange={(assetPaths) =>
                            updateSelected(
                              { callToAction: { ...selectedProfile.callToAction, assetPaths } },
                              ['cta'],
                            )
                          }
                        />
                      </section>

                      <section className="grid gap-5 rounded-lg border border-border bg-card p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold">Brand and reference assets</h3>
                            <p className="text-xs text-muted-foreground">
                              Stable copies are kept in BatchClip app storage.
                            </p>
                          </div>
                          <Badge
                            variant={missingPaths.size > 0 ? 'destructive' : 'secondary'}
                            className="gap-1.5"
                          >
                            <HeartPulse className="h-3.5 w-3.5" aria-hidden />
                            {healthLoading
                              ? 'Checking assets'
                              : missingPaths.size > 0
                                ? `${missingPaths.size} missing`
                                : `${selectedAssetPaths.length} ready`}
                          </Badge>
                        </div>
                        <CreatorAssetField
                          label="Logo"
                          description="PNG, JPG, or WEBP up to 5 MB."
                          kind="logo"
                          single
                          paths={selectedProfile.logoPath ? [selectedProfile.logoPath] : []}
                          missingPaths={missingPaths}
                          onChange={(paths) =>
                            updateSelected({ logoPath: paths[0] ?? null }, ['logo'])
                          }
                        />
                        <Separator />
                        <CreatorAssetField
                          label="Evidence and capture assets"
                          description="Product captures, testimonials, or proof kept ready for creator promo workflows."
                          kind="evidence"
                          paths={selectedProfile.evidenceAssetPaths}
                          missingPaths={missingPaths}
                          onChange={(evidenceAssetPaths) =>
                            updateSelected({ evidenceAssetPaths }, ['evidenceAssets'])
                          }
                        />
                        <Separator />
                        <ProfileField
                          label="Reference links"
                          htmlFor="profile-reference-links"
                          description="One URL per line. Keep inspiration inspectable instead of burying it in notes."
                        >
                          <textarea
                            id="profile-reference-links"
                            rows={3}
                            className={TEXTAREA_CLASS}
                            value={selectedProfile.referenceLinks.join('\n')}
                            placeholder="https://youtube.com/…"
                            onChange={(event) =>
                              updateSelected(
                                {
                                  referenceLinks: event.target.value
                                    .split('\n')
                                    .map((line) => line.trim())
                                    .filter(Boolean),
                                },
                                ['references'],
                              )
                            }
                          />
                        </ProfileField>
                        <CreatorAssetField
                          label="Reference files"
                          description="Images, videos, or PDFs that define the intended treatment."
                          kind="reference"
                          paths={selectedProfile.referenceAssetPaths}
                          missingPaths={missingPaths}
                          onChange={(referenceAssetPaths) =>
                            updateSelected({ referenceAssetPaths }, ['references'])
                          }
                        />
                      </section>

                      <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
                        <div>
                          <h3 className="font-semibold">Platform and long-form defaults</h3>
                          <p className="text-xs text-muted-foreground">
                            Applied when a project selects this profile. Projects can override each
                            value explicitly.
                          </p>
                        </div>
                        <div className="max-w-sm">
                          <ProfileField label="Target platform" htmlFor="profile-platform">
                            <Select
                              value={selectedProfile.targetPlatform}
                              onValueChange={(value) =>
                                updateSelected({ targetPlatform: value as Platform }, [
                                  'targetPlatform',
                                ])
                              }
                            >
                              <SelectTrigger id="profile-platform">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(PLATFORM_LABELS) as Platform[]).map((platform) => (
                                  <SelectItem key={platform} value={platform}>
                                    {PLATFORM_LABELS[platform]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </ProfileField>
                        </div>
                        <div className="border-t border-border pt-4">
                          <LongformAppearancePicker
                            style={selectedProfile.longformStoryboardStyle}
                            paletteId={selectedProfile.longformPaletteId}
                            onStyleChange={(longformStoryboardStyle) =>
                              updateSelected({ longformStoryboardStyle }, [
                                'longformStoryboardStyle',
                              ])
                            }
                            onPaletteChange={(longformPaletteId) =>
                              updateSelected({ longformPaletteId }, ['longformPalette'])
                            }
                            showProfileDefault={false}
                          />
                        </div>
                        <SafeZoneFields
                          value={selectedProfile.templateLayout}
                          onChange={(templateLayout) =>
                            updateSelected({ templateLayout }, ['safeZone'])
                          }
                        />
                        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/35 p-3 text-xs text-muted-foreground">
                          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                          <p>
                            Vertical exports stay 1080 × 1920 at 30 fps with the PRESTYJ style. The
                            selected palette supplies the accent; all four caption modes remain
                            available.
                          </p>
                        </div>
                      </section>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="project" className="mt-4">
              <div className="grid gap-5">
                <section className="grid gap-3 rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">Profile for this project</h3>
                      <p className="text-xs text-muted-foreground">
                        Applying a profile updates this project and the app's remembered starting
                        choices. It does not regenerate existing clips or scenes.
                      </p>
                    </div>
                    {Object.keys(projectProfile.overrides).length > 0 && (
                      <Button type="button" variant="outline" onClick={clearAllOverrides}>
                        <RotateCcw className="h-4 w-4" aria-hidden />
                        Clear all overrides
                      </Button>
                    )}
                  </div>
                  <Label htmlFor="project-profile">Creator Profile</Label>
                  <Select
                    value={projectProfile.profileId ?? 'none'}
                    onValueChange={(value) => applyProfile(value === 'none' ? null : value)}
                  >
                    <SelectTrigger id="project-profile">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No reusable profile</SelectItem>
                      {profiles.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </section>

                {!appliedProfile ? (
                  <div className="rounded-lg border border-dashed border-border px-5 py-8 text-center">
                    <p className="text-sm font-medium">
                      Select a profile to inspect project defaults.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Short-form projects can use a Creative Brief without a profile.
                    </p>
                  </div>
                ) : (
                  <section className="grid gap-5 rounded-lg border border-border bg-card p-4">
                    <div>
                      <h3 className="font-semibold">Clear project overrides</h3>
                      <p className="text-xs text-muted-foreground">
                        Overrides leave the reusable profile unchanged. Audience, platform, layout,
                        style and palette also update remembered starting choices.
                      </p>
                    </div>
                    {(['audience', 'tone', 'callToAction'] as const).map((key) => {
                      const profileValue =
                        key === 'callToAction'
                          ? appliedProfile.callToAction.text
                          : appliedProfile[key];
                      const value = projectProfile.overrides[key] ?? profileValue;
                      const overridden = key in projectProfile.overrides;
                      const label =
                        key === 'callToAction'
                          ? 'Call to action'
                          : key === 'audience'
                            ? 'Audience'
                            : 'Tone';
                      return (
                        <div key={key} className="grid gap-1.5">
                          <div className="flex items-center justify-between gap-3">
                            <Label htmlFor={`project-${key}`}>{label}</Label>
                            {overridden ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => clearOverride(key)}
                              >
                                Use profile default
                              </Button>
                            ) : (
                              <Badge variant="secondary">Profile default</Badge>
                            )}
                          </div>
                          <Input
                            id={`project-${key}`}
                            value={value}
                            placeholder={`No ${label.toLowerCase()} default`}
                            onChange={(event) => setProjectOverride(key, event.target.value)}
                          />
                        </div>
                      );
                    })}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Label htmlFor="project-platform">Target platform</Label>
                          {'targetPlatform' in projectProfile.overrides && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => clearOverride('targetPlatform')}
                            >
                              Use profile
                            </Button>
                          )}
                        </div>
                        <Select
                          value={
                            projectProfile.overrides.targetPlatform ?? appliedProfile.targetPlatform
                          }
                          onValueChange={(value) =>
                            setProjectOverride('targetPlatform', value as Platform)
                          }
                        >
                          <SelectTrigger id="project-platform">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(PLATFORM_LABELS) as Platform[]).map((platform) => (
                              <SelectItem key={platform} value={platform}>
                                {PLATFORM_LABELS[platform]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Label htmlFor="project-storyboard-style">Storyboard style</Label>
                          {'longformStoryboardStyle' in projectProfile.overrides && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => clearOverride('longformStoryboardStyle')}
                            >
                              Use profile
                            </Button>
                          )}
                        </div>
                        <Select
                          value={
                            projectProfile.overrides.longformStoryboardStyle ??
                            appliedProfile.longformStoryboardStyle
                          }
                          onValueChange={(value) =>
                            setProjectOverride('longformStoryboardStyle', value as StoryboardStyle)
                          }
                        >
                          <SelectTrigger id="project-storyboard-style">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ink">Ink</SelectItem>
                            <SelectItem value="polish">Polish</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Label htmlFor="project-palette">Long-form palette</Label>
                          {'longformPaletteId' in projectProfile.overrides && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => clearOverride('longformPaletteId')}
                            >
                              Use profile
                            </Button>
                          )}
                        </div>
                        <Select
                          value={
                            projectProfile.overrides.longformPaletteId ??
                            appliedProfile.longformPaletteId
                          }
                          onValueChange={(value) => setProjectOverride('longformPaletteId', value)}
                        >
                          <SelectTrigger id="project-palette">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {allPalettes.map((palette) => (
                              <SelectItem key={palette.id} value={palette.id}>
                                {palette.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">Safe-zone layout</p>
                        {'templateLayout' in projectProfile.overrides && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => clearOverride('templateLayout')}
                          >
                            Use profile
                          </Button>
                        )}
                      </div>
                      <SafeZoneFields
                        value={
                          projectProfile.overrides.templateLayout ?? appliedProfile.templateLayout
                        }
                        onChange={(value) => setProjectOverride('templateLayout', value)}
                      />
                    </div>
                  </section>
                )}
              </div>
            </TabsContent>

            <TabsContent value="memory" className="mt-4">
              <section className="grid gap-4">
                <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
                  <CopyCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <div>
                    <h3 className="font-semibold">Transparent remembered preferences</h3>
                    <p className="text-sm text-muted-foreground">
                      Only values you explicitly save in a Creator Profile appear here. BatchClip
                      does not silently turn project edits into permanent preferences.
                    </p>
                  </div>
                </div>

                {preferences.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-5 py-10 text-center">
                    <p className="text-sm font-medium">No remembered preferences yet.</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Create or edit a Creator Profile to save reusable defaults.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                      <thead className="bg-muted/60 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Preference</th>
                          <th className="px-3 py-2 font-medium">Value</th>
                          <th className="px-3 py-2 font-medium">Source</th>
                          <th className="px-3 py-2 font-medium">Scope</th>
                          <th className="px-3 py-2 font-medium">Updated</th>
                          <th className="px-3 py-2">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {preferences.map((preference) => (
                          <tr key={preference.id} className="border-t border-border align-top">
                            <th scope="row" className="px-3 py-3 font-medium">
                              {preference.label}
                            </th>
                            <td
                              className="max-w-64 px-3 py-3 text-muted-foreground"
                              title={preference.value}
                            >
                              {preference.value}
                            </td>
                            <td className="px-3 py-3 text-muted-foreground">{preference.source}</td>
                            <td className="px-3 py-3 text-muted-foreground">{preference.scope}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                              {formatUpdated(preference.updatedAt)}
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex justify-end gap-1">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-9 w-9"
                                  aria-label={`Edit ${preference.label} in ${preference.profileName}`}
                                  onClick={() => editPreference(preference.profileId)}
                                >
                                  <Pencil className="h-4 w-4" aria-hidden />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-9 w-9 text-destructive hover:text-destructive"
                                  aria-label={`Delete ${preference.label} from ${preference.profileName}`}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Delete ${preference.label} from ${preference.profileName}? Projects using this profile will fall back for that field.`,
                                      )
                                    )
                                      deleteRememberedPreference(
                                        preference.profileId,
                                        preference.key,
                                      );
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
