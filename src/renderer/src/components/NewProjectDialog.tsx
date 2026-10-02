import { findLongformPalette } from '@shared/longform-palette';
import { DEFAULT_STORYBOARD_STYLE, type StoryboardStyle } from '@shared/storyboards';
import { FileVideo, FolderOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type EntrySource, isYouTubeUrl } from '@/components/entry-source';
import { LongformAppearancePicker } from '@/components/LongformAppearancePicker';
import { PythonSetupCard } from '@/components/PythonSetupCard';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { useCreatorProfiles } from '@/services/creator-profiles';
import { useStore } from '@/store';

export interface NewProjectDraft {
  name: string;
  outputMode: 'short' | 'longform';
  source: EntrySource;
  appearance: { storyboardStyle: StoryboardStyle; paletteId: string };
  profileId?: string;
  brief?: {
    audience: string;
    goal: string;
    callToAction: string;
  };
}

interface NewProjectDialogProps {
  open: boolean;
  busy: boolean;
  intent?: 'new' | 'add';
  initialSource?: EntrySource | null;
  error?: string | null;
  keyMissing?: boolean;
  onOpenSettings?: () => void;
  onOpenChange: (open: boolean) => void;
  onChooseFile: () => Promise<string | null>;
  onCreate: (draft: NewProjectDraft) => void;
}

function filenameStem(filePath: string): string {
  const filename = filePath.split(/[/\\]/).pop() ?? '';
  return filename.replace(/\.[^.]+$/, '');
}

export function NewProjectDialog({
  open,
  busy,
  intent = 'new',
  initialSource,
  error: actionError,
  keyMissing = false,
  onOpenSettings,
  onOpenChange,
  onChooseFile,
  onCreate,
}: NewProjectDialogProps): React.JSX.Element {
  const profiles = useCreatorProfiles();
  const settings = useStore((state) => state.settings);
  const rememberedMode = settings.outputMode;
  const projectName = useStore((state) => state.currentProject.displayName);
  const pythonStatus = useStore((state) => state.pythonStatus);
  const initialized = useRef(false);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const [name, setName] = useState('');
  const [outputMode, setOutputMode] = useState<'short' | 'longform'>('short');
  const [filePath, setFilePath] = useState('');
  const [url, setUrl] = useState('');
  const [profileId, setProfileId] = useState('none');
  const [audience, setAudience] = useState('');
  const [goal, setGoal] = useState('');
  const [callToAction, setCallToAction] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [storyboardStyle, setStoryboardStyle] = useState<StoryboardStyle>(DEFAULT_STORYBOARD_STYLE);
  const [paletteId, setPaletteId] = useState(settings.longformPaletteId);
  const explicitStyle = useRef(false);
  const explicitPalette = useRef(false);
  const paletteResolved = findLongformPalette(paletteId, settings.customPalettes);

  const selectProfile = (id: string): void => {
    setProfileId(id);
    const profile = profiles.find((item) => item.id === id);
    if (!explicitStyle.current)
      setStoryboardStyle(
        profile?.longformStoryboardStyle ??
          settings.longformStoryboardStyle ??
          DEFAULT_STORYBOARD_STYLE,
      );
    if (!explicitPalette.current)
      setPaletteId(profile?.longformPaletteId ?? settings.longformPaletteId);
  };

  useEffect(() => {
    if (!open || initialized.current) return;
    initialized.current = true;
    setOutputMode(rememberedMode);
    setStoryboardStyle(settings.longformStoryboardStyle ?? DEFAULT_STORYBOARD_STYLE);
    setPaletteId(settings.longformPaletteId);
  }, [open, rememberedMode, settings.longformStoryboardStyle, settings.longformPaletteId]);

  useEffect(() => {
    if (!initialSource) return;
    setFilePath(initialSource.kind === 'file' ? initialSource.value : '');
    setUrl(initialSource.kind === 'url' ? initialSource.value : '');
    setError(null);
  }, [initialSource]);

  const chooseFile = async (): Promise<void> => {
    const selectedPath = await onChooseFile();
    if (!selectedPath) return;
    setFilePath(selectedPath);
    setUrl('');
    setName((current) => current || filenameStem(selectedPath));
    setError(null);
  };

  const create = (): void => {
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (busy || pythonStatus !== 'ready') return;
    if (outputMode === 'longform' && !paletteResolved) {
      setError('Choose an available palette before generating.');
      return;
    }
    if (intent === 'new' && !trimmedName) {
      setError('Enter a project name.');
      return;
    }
    if (!filePath && !trimmedUrl) {
      setError('Choose a video or paste a YouTube URL.');
      return;
    }
    if (!filePath && !isYouTubeUrl(trimmedUrl)) {
      setError('Paste a valid YouTube video URL.');
      return;
    }
    onCreate({
      name: intent === 'new' ? trimmedName : projectName,
      outputMode,
      appearance: { storyboardStyle, paletteId },
      source: filePath ? { kind: 'file', value: filePath } : { kind: 'url', value: trimmedUrl },
      ...(profileId !== 'none' ? { profileId } : {}),
      ...(audience.trim() || goal.trim() || callToAction.trim()
        ? {
            brief: {
              audience: audience.trim(),
              goal: goal.trim(),
              callToAction: callToAction.trim(),
            },
          }
        : {}),
    });
  };

  const canCreate =
    (intent === 'add' || name.trim().length > 0) &&
    (filePath.length > 0 || url.trim().length > 0) &&
    pythonStatus === 'ready' &&
    (outputMode !== 'longform' || Boolean(paletteResolved));

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl"
        onOpenAutoFocus={() => {
          returnFocusTo.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocusTo.current?.isConnected) {
            event.preventDefault();
            returnFocusTo.current.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{intent === 'new' ? 'New project' : 'Confirm import'}</DialogTitle>
          <DialogDescription className="break-words">
            {intent === 'new'
              ? 'Create a separate project. Current work is replaced only when you confirm below.'
              : `Add footage to “${projectName}”. Existing sources and work are kept.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          {intent === 'new' && (
            <div className="grid gap-2">
              <Label htmlFor="new-project-name">Project name</Label>
              <Input
                id="new-project-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
                placeholder="Creator launch interview"
                autoFocus
                disabled={busy}
              />
            </div>
          )}

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Source</legend>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-11 justify-start gap-3 px-3 py-2 text-left"
              disabled={busy}
              onClick={() => void chooseFile()}
            >
              <FolderOpen className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {filePath ? 'Change video' : 'Choose video'}
                </span>
                <span
                  className="text-muted-foreground block break-all whitespace-normal text-xs"
                  title={filePath}
                >
                  {filePath || 'MP4, MOV, AVI, MKV, WEBM, MTS, or M4V'}
                </span>
              </span>
            </Button>

            <div className="flex items-center gap-3 py-1" aria-hidden>
              <span className="bg-border h-px flex-1" />
              <span className="text-muted-foreground text-xs">or</span>
              <span className="bg-border h-px flex-1" />
            </div>

            <Label htmlFor="new-project-url">YouTube URL</Label>
            <div className="relative">
              <FileVideo
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                id="new-project-url"
                type="url"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  if (event.target.value) setFilePath('');
                  setError(null);
                }}
                placeholder="https://youtube.com/watch?v=…"
                className="pl-9"
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </fieldset>

          <div className="grid gap-2">
            <Label htmlFor="new-project-output-mode">Output mode</Label>
            <Select
              value={outputMode}
              onValueChange={(value) => setOutputMode(value as 'short' | 'longform')}
              disabled={busy}
            >
              <SelectTrigger id="new-project-output-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Short clips (9:16)</SelectItem>
                <SelectItem value="longform">Long-form edit (16:9)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {outputMode === 'short'
                ? 'Find vertical moments to review before exporting. 1080 × 1920 · 30 fps.'
                : 'Build a source-ordered scene-first draft to review before exporting. 1920 × 1080 · 30 fps.'}
            </p>
            <p className="text-muted-foreground text-xs">
              This mode is remembered after confirmation. No export starts here.
            </p>
            {outputMode === 'longform' && (
              <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                Creative Brief is not used for initial scene planning. The transcript guides the
                draft; use scene feedback during review to request revisions.{' '}
                {intent === 'new'
                  ? 'Brief text entered here is kept in the new project.'
                  : 'Existing project brief text is kept.'}
              </p>
            )}
          </div>

          {outputMode === 'longform' && (
            <LongformAppearancePicker
              style={storyboardStyle}
              paletteId={paletteId}
              onStyleChange={(style) => {
                explicitStyle.current = true;
                setStoryboardStyle(style);
              }}
              onPaletteChange={(id) => {
                explicitPalette.current = true;
                setPaletteId(id);
              }}
              showProfileDefault={false}
              disabled={busy}
            />
          )}

          {intent === 'new' && (outputMode === 'short' || profiles.length > 0) && (
            <details className="border-border rounded-lg border px-3 py-2.5">
              <summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {outputMode === 'short'
                  ? 'Add Creative Brief or Creator Profile (optional)'
                  : 'Creator Profile (optional)'}
              </summary>
              <div className="grid gap-4 pt-4">
                {profiles.length > 0 && (
                  <div className="grid gap-2">
                    <Label htmlFor="new-project-profile">Creator Profile</Label>
                    <Select value={profileId} onValueChange={selectProfile} disabled={busy}>
                      <SelectTrigger id="new-project-profile">
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
                    <p className="text-xs text-muted-foreground">
                      Seeds audience, platform, layout, storyboard style and palette defaults. Your
                      explicit appearance choices above take precedence on confirmation.
                    </p>
                  </div>
                )}
                {outputMode === 'short' && (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="new-project-audience">Audience</Label>
                      <Input
                        id="new-project-audience"
                        value={audience}
                        onChange={(event) => setAudience(event.target.value)}
                        placeholder="Independent founders"
                        disabled={busy}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="new-project-goal">Goal</Label>
                      <Input
                        id="new-project-goal"
                        value={goal}
                        onChange={(event) => setGoal(event.target.value)}
                        placeholder="Build trust before launch"
                        disabled={busy}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="new-project-cta">Call to action</Label>
                      <Input
                        id="new-project-cta"
                        value={callToAction}
                        onChange={(event) => setCallToAction(event.target.value)}
                        placeholder="Join the launch list"
                        disabled={busy}
                      />
                    </div>
                  </>
                )}
              </div>
            </details>
          )}

          {pythonStatus !== 'ready' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground" role="status">
                Your source selection is kept. Prepare local tools, then confirm below. Processing
                will not start automatically.
              </p>
              <PythonSetupCard context="settings" />
            </div>
          )}
          {keyMissing && (
            <div className="space-y-2 rounded-md border border-destructive/40 p-3" role="alert">
              <p className="text-sm font-medium">Gemini API key required</p>
              <p className="text-xs text-muted-foreground">
                Add a key in Settings, then confirm again. Your source selection is kept.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={onOpenSettings}>
                Open Settings
              </Button>
            </div>
          )}
          {(error || actionError) && (
            <p className="text-destructive break-words text-sm" role="alert">
              {error || actionError}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Cancel keeps this selection for this lobby visit. No download or AI processing begins
            before confirmation.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || !canCreate} onClick={create}>
            {busy
              ? 'Preparing source…'
              : intent === 'new'
                ? 'Create project and process'
                : 'Add source and process'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
