/**
 * SettingsWindow — top-level component rendered into the dedicated Electron
 * settings BrowserWindow (route `#settings`, see `src/main/settings-window.ts`).
 *
 * Three tabs:
 *   • API Keys — Gemini, Pexels, fal.ai (each with show/hide toggle)
 *   • Output   — output directory chosen via the OS folder picker (IPC)
 *   • Advanced — autosave interval slider (10s–5min)
 *
 * All values are persisted through the renderer's existing secret-store IPC
 * (`window.api.secrets.*`), which is backed by `src/main/secrets.ts`
 * (Electron `safeStorage`). The Save button at the bottom commits every
 * field at once; nothing is written until Save is pressed.
 *
 * UI primitives are restricted to shadcn (Tabs, Input, Button, Slider, Label,
 * Card, Separator) and lucide-react (Eye, EyeOff, Folder, Save, Key) per spec.
 */

import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { Eye, EyeOff, Folder, Key, Save } from 'lucide-react'

// ---------------------------------------------------------------------------
// Persisted secret keys — all stored via the safeStorage-backed secret store.
// API keys are sensitive; outputDirectory & autosaveIntervalMs ride the same
// channel for simplicity (it's a generic key/value store).
// ---------------------------------------------------------------------------

const SECRET_KEYS = {
  gemini: 'gemini',
  pexels: 'pexels',
  fal: 'fal',
  outputDirectory: 'outputDirectory',
  autosaveIntervalMs: 'autosaveIntervalMs',
} as const

// Slider bounds — 10 seconds → 5 minutes (300 seconds), step = 10s.
const AUTOSAVE_MIN_SEC = 10
const AUTOSAVE_MAX_SEC = 300
const AUTOSAVE_STEP_SEC = 10
const AUTOSAVE_DEFAULT_SEC = 60

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAutosaveInterval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rem = seconds % 60
  if (rem === 0) return `${minutes}m`
  return `${minutes}m ${rem}s`
}

async function readSecret(name: string): Promise<string | null> {
  try {
    return await window.api.secrets.get(name)
  } catch {
    return null
  }
}

async function writeSecret(name: string, value: string): Promise<void> {
  await window.api.secrets.set(name, value)
}

// ---------------------------------------------------------------------------
// SecretInput — password-style <Input> with an Eye/EyeOff toggle button
// ---------------------------------------------------------------------------

interface SecretInputProps {
  id: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}

function SecretInput({ id, value, placeholder, onChange }: SecretInputProps): React.JSX.Element {
  const [visible, setVisible] = React.useState(false)
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide value' : 'Show value'}
        className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SettingsWindow
// ---------------------------------------------------------------------------

interface FormState {
  gemini: string
  pexels: string
  fal: string
  outputDirectory: string
  autosaveIntervalSec: number
}

const EMPTY_FORM: FormState = {
  gemini: '',
  pexels: '',
  fal: '',
  outputDirectory: '',
  autosaveIntervalSec: AUTOSAVE_DEFAULT_SEC,
}

export default function SettingsWindow(): React.JSX.Element {
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [status, setStatus] = React.useState<{ kind: 'idle' | 'saved' | 'error'; message?: string }>(
    { kind: 'idle' }
  )

  // Hydrate from main on mount
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const [gemini, pexels, fal, outputDirectory, autosaveRaw] = await Promise.all([
        readSecret(SECRET_KEYS.gemini),
        readSecret(SECRET_KEYS.pexels),
        readSecret(SECRET_KEYS.fal),
        readSecret(SECRET_KEYS.outputDirectory),
        readSecret(SECRET_KEYS.autosaveIntervalMs),
      ])
      if (cancelled) return

      const parsedMs = autosaveRaw ? Number.parseInt(autosaveRaw, 10) : NaN
      const autosaveSec = Number.isFinite(parsedMs)
        ? Math.min(AUTOSAVE_MAX_SEC, Math.max(AUTOSAVE_MIN_SEC, Math.round(parsedMs / 1000)))
        : AUTOSAVE_DEFAULT_SEC

      setForm({
        gemini: gemini ?? '',
        pexels: pexels ?? '',
        fal: fal ?? '',
        outputDirectory: outputDirectory ?? '',
        autosaveIntervalSec: autosaveSec,
      })
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (status.kind !== 'idle') setStatus({ kind: 'idle' })
  }

  const handlePickFolder = async (): Promise<void> => {
    try {
      const dir = await window.api.openDirectory()
      if (dir) update('outputDirectory', dir)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStatus({ kind: 'error', message: `Couldn't open folder picker: ${msg}` })
    }
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    setStatus({ kind: 'idle' })
    try {
      await Promise.all([
        writeSecret(SECRET_KEYS.gemini, form.gemini.trim()),
        writeSecret(SECRET_KEYS.pexels, form.pexels.trim()),
        writeSecret(SECRET_KEYS.fal, form.fal.trim()),
        writeSecret(SECRET_KEYS.outputDirectory, form.outputDirectory.trim()),
        writeSecret(
          SECRET_KEYS.autosaveIntervalMs,
          String(form.autosaveIntervalSec * 1000)
        ),
      ])
      // Notify the main window so it re-hydrates secrets from safeStorage.
      // Without this, the main window's in-memory geminiApiKey stays empty
      // and the scoring step fails with "API key required".
      try {
        new BroadcastChannel('batchclip-settings-sync').postMessage({
          type: 'settings-changed',
          timestamp: Date.now(),
        })
      } catch {
        // BroadcastChannel unavailable — main window will pick up on next mount
      }
      setStatus({ kind: 'saved', message: 'Settings saved' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStatus({ kind: 'error', message: `Failed to save: ${msg}` })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-background text-foreground flex h-screen w-full flex-col">
      <header className="border-border flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <Key className="text-muted-foreground h-4 w-4" />
        <span className="text-sm font-semibold tracking-tight">Settings</span>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <Tabs defaultValue="api-keys" className="flex h-full w-full flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
            <TabsTrigger value="output">Output</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          {/* ---------------------------------------------------------------
              API Keys
              --------------------------------------------------------------- */}
          <TabsContent value="api-keys" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">API Keys</CardTitle>
                <CardDescription>
                  Stored encrypted on this machine via the OS keychain.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="gemini-key">Gemini API key</Label>
                  <SecretInput
                    id="gemini-key"
                    value={form.gemini}
                    placeholder="AIza…"
                    onChange={(v) => update('gemini', v)}
                  />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor="pexels-key">Pexels API key</Label>
                  <SecretInput
                    id="pexels-key"
                    value={form.pexels}
                    placeholder="563492…"
                    onChange={(v) => update('pexels', v)}
                  />
                  <p className="text-muted-foreground text-xs">
                    Used for b-roll videos in split-image and fullscreen-image segments. Free at pexels.com/api.
                  </p>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor="fal-key">fal.ai API key</Label>
                  <SecretInput
                    id="fal-key"
                    value={form.fal}
                    placeholder="key_id:key_secret"
                    onChange={(v) => update('fal', v)}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------------------
              Output
              --------------------------------------------------------------- */}
          <TabsContent value="output" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Output</CardTitle>
                <CardDescription>
                  Where rendered clips are written. Falls back to the system default when empty.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="output-dir">Output directory</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="output-dir"
                      value={form.outputDirectory}
                      placeholder="No folder selected"
                      readOnly
                      className="flex-1"
                    />
                    <Button type="button" variant="outline" onClick={handlePickFolder}>
                      <Folder />
                      Choose…
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------------------
              Advanced
              --------------------------------------------------------------- */}
          <TabsContent value="advanced" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Advanced</CardTitle>
                <CardDescription>Project autosave behaviour.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="autosave-interval">Autosave interval</Label>
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {formatAutosaveInterval(form.autosaveIntervalSec)}
                    </span>
                  </div>
                  <Slider
                    id="autosave-interval"
                    min={AUTOSAVE_MIN_SEC}
                    max={AUTOSAVE_MAX_SEC}
                    step={AUTOSAVE_STEP_SEC}
                    value={[form.autosaveIntervalSec]}
                    onValueChange={(v) => update('autosaveIntervalSec', v[0] ?? AUTOSAVE_DEFAULT_SEC)}
                  />
                  <div className="text-muted-foreground flex justify-between text-xs">
                    <span>{formatAutosaveInterval(AUTOSAVE_MIN_SEC)}</span>
                    <span>{formatAutosaveInterval(AUTOSAVE_MAX_SEC)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-border flex shrink-0 items-center justify-between gap-3 border-t px-4 py-3">
        <span
          className={
            status.kind === 'saved'
              ? 'text-sm text-emerald-500'
              : status.kind === 'error'
                ? 'text-destructive text-sm'
                : 'text-muted-foreground text-sm'
          }
          role={status.kind === 'error' ? 'alert' : undefined}
        >
          {status.message ?? (loading ? 'Loading…' : '')}
        </span>
        <Button onClick={handleSave} disabled={saving || loading}>
          <Save />
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </footer>
    </div>
  )
}
