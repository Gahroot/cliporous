import { ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { Ch } from '@shared/ipc-channels'
import { wrapHandler } from '../ipc-error-handler'

interface ExportClip {
  clipName: string
  score: number
  duration: number
  hookText: string
  platforms: Array<{ platform: string; text: string; hashtags: string[] }>
  shortDescription: string
  hashtag: string
}

function formatAsCSV(clips: ExportClip[]): string {
  const escapeCSV = (s: string) => `"${s.replace(/"/g, '""')}"`
  const headers = ['Clip Name', 'Platform', 'Description', 'Hashtags', 'Hook Text', 'Score', 'Duration (s)']
  const rows: string[] = [headers.map(escapeCSV).join(',')]
  for (const clip of clips) {
    for (const p of clip.platforms) {
      rows.push([
        escapeCSV(clip.clipName),
        escapeCSV(p.platform),
        escapeCSV(p.text),
        escapeCSV(p.hashtags.map((h) => `#${h}`).join(' ')),
        escapeCSV(clip.hookText),
        String(clip.score),
        clip.duration.toFixed(1)
      ].join(','))
    }
  }
  return rows.join('\n')
}

function formatAsJSON(clips: ExportClip[]): string {
  const data = {
    exportedAt: new Date().toISOString(),
    clipCount: clips.length,
    clips: clips.map((clip) => ({
      clipName: clip.clipName,
      score: clip.score,
      duration: clip.duration,
      hookText: clip.hookText,
      shortDescription: clip.shortDescription,
      hashtag: clip.hashtag,
      platforms: clip.platforms
    }))
  }
  return JSON.stringify(data, null, 2)
}

function formatAsTXT(clips: ExportClip[]): string {
  const sections: string[] = [
    `BatchContent — Social Media Descriptions`,
    `Exported: ${new Date().toLocaleString()}`,
    `Clips: ${clips.length}`,
    '='.repeat(60)
  ]
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]
    sections.push('')
    sections.push(`Clip ${i + 1}: ${clip.clipName}`)
    sections.push(`Score: ${clip.score}/100  |  Duration: ${clip.duration.toFixed(1)}s`)
    sections.push(`Hook: ${clip.hookText}`)
    sections.push('-'.repeat(40))
    for (const p of clip.platforms) {
      const label =
        p.platform === 'youtube-shorts' ? 'YouTube Shorts'
        : p.platform === 'instagram-reels' ? 'Instagram Reels'
        : 'TikTok'
      sections.push(`[${label}]`)
      sections.push(p.text)
      sections.push('')
    }
  }
  return sections.join('\n')
}

export function registerExportHandlers(): void {
  ipcMain.handle(
    Ch.Invoke.EXPORT_DESCRIPTIONS,
    wrapHandler(Ch.Invoke.EXPORT_DESCRIPTIONS, async (
      _event,
      clips: ExportClip[],
      outputDirectory: string,
      format: 'csv' | 'json' | 'txt'
    ): Promise<string> => {
      if (!existsSync(outputDirectory)) mkdirSync(outputDirectory, { recursive: true })

      if (format === 'csv') {
        const csvPath = join(outputDirectory, 'descriptions.csv')
        writeFileSync(csvPath, formatAsCSV(clips), 'utf-8')
        return csvPath
      }

      if (format === 'json') {
        const jsonPath = join(outputDirectory, 'descriptions.json')
        writeFileSync(jsonPath, formatAsJSON(clips), 'utf-8')
        return jsonPath
      }

      // txt
      const txtPath = join(outputDirectory, 'descriptions.txt')
      writeFileSync(txtPath, formatAsTXT(clips), 'utf-8')
      return txtPath
    })
  )
}
