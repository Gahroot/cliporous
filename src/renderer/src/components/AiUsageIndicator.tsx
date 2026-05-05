import { useState } from 'react'
import { Sparkles, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useStore } from '@/store'

// ---------------------------------------------------------------------------
// Gemini 2.5 Flash-Lite pricing (as of March 2026)
// Input: $0.10 / 1M tokens
// Output: $0.40 / 1M tokens
// ---------------------------------------------------------------------------
const PRICE_INPUT_PER_M = 0.10
const PRICE_OUTPUT_PER_M = 0.40

// Source label map for human-readable names
const SOURCE_LABELS: Record<string, string> = {
  scoring: 'Viral Scoring',
  rescore: 'Re-score',
  hooks: 'Hook Text',
  'curiosity-gaps': 'Curiosity Gaps',
  descriptions: 'Descriptions',
  'loop-optimizer': 'Loop Optimizer',
  'story-arcs': 'Story Arcs',
  variants: 'Clip Variants',
  rehook: 'Re-hook Text',
  stitching: 'Clip Stitching',
  'broll-keywords': 'B-Roll Keywords',
  'emoji-moments': 'Emoji Moments',
  'fake-comment': 'Fake Comment',
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatCost(usd: number): string {
  if (usd < 0.001) return '< $0.001'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(3)}`
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

export function AiUsageIndicator(): React.JSX.Element {
  const aiUsage = useStore((s) => s.aiUsage)
  const resetAiUsage = useStore((s) => s.resetAiUsage)
  const [open, setOpen] = useState(false)

  const totalTokens = aiUsage.totalPromptTokens + aiUsage.totalCompletionTokens
  const estimatedCost =
    (aiUsage.totalPromptTokens / 1_000_000) * PRICE_INPUT_PER_M +
    (aiUsage.totalCompletionTokens / 1_000_000) * PRICE_OUTPUT_PER_M

  const tokenColor =
    totalTokens >= 200_000
      ? 'text-red-500'
      : totalTokens >= 50_000
        ? 'text-amber-500'
        : 'text-muted-foreground'

  // Aggregate usage by source
  const bySource = aiUsage.callHistory.reduce<
    Record<string, { promptTokens: number; completionTokens: number; calls: number }>
  >((acc, entry) => {
    const key = entry.source
    if (!acc[key]) acc[key] = { promptTokens: 0, completionTokens: 0, calls: 0 }
    acc[key].promptTokens += entry.promptTokens
    acc[key].completionTokens += entry.completionTokens
    acc[key].calls += 1
    return acc
  }, {})

  const sourceSorted = Object.entries(bySource).sort(
    (a, b) =>
      b[1].promptTokens + b[1].completionTokens -
      (a[1].promptTokens + a[1].completionTokens),
  )

  const sessionDuration = Date.now() - aiUsage.sessionStarted

  if (aiUsage.totalCalls === 0) {
    return (
      <div className="text-muted-foreground/40 flex items-center gap-1 px-1 text-xs">
        <Sparkles className="h-3 w-3" />
      </div>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={`border-border hover:bg-accent/50 data-[state=open]:bg-accent flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors ${tokenColor}`}
          title="AI token usage this session"
        >
          <Sparkles className="h-3 w-3 shrink-0" />
          <span className="font-mono tabular-nums">{formatTokens(totalTokens)}</span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72 p-0">
        {/* Header */}
        <div className="border-border bg-card flex items-center gap-2 border-b px-3 py-2">
          <Sparkles className="text-primary h-3.5 w-3.5" />
          <span className="text-xs font-semibold">AI Usage — This Session</span>
        </div>

        {/* Main stats */}
        <div className="space-y-2 px-3 py-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-muted/50 rounded-md p-2">
              <div
                className={`font-mono text-lg leading-tight font-bold tabular-nums ${tokenColor}`}
              >
                {formatTokens(totalTokens)}
              </div>
              <div className="text-muted-foreground mt-0.5 text-[10px]">Total tokens</div>
            </div>
            <div className="bg-muted/50 rounded-md p-2">
              <div className="text-foreground font-mono text-lg leading-tight font-bold tabular-nums">
                {formatCost(estimatedCost)}
              </div>
              <div className="text-muted-foreground mt-0.5 text-[10px]">Est. cost</div>
            </div>
          </div>

          <div className="text-muted-foreground flex justify-between text-[10px]">
            <span>
              Input:{' '}
              <span className="text-foreground font-mono">
                {formatTokens(aiUsage.totalPromptTokens)}
              </span>
            </span>
            <span>
              Output:{' '}
              <span className="text-foreground font-mono">
                {formatTokens(aiUsage.totalCompletionTokens)}
              </span>
            </span>
            <span>
              Calls: <span className="text-foreground font-mono">{aiUsage.totalCalls}</span>
            </span>
          </div>

          <div className="text-muted-foreground text-[10px]">
            Session: <span className="text-foreground">{formatDuration(sessionDuration)}</span>
          </div>
        </div>

        {sourceSorted.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-3 py-2">
              <div className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wide uppercase">
                By Feature
              </div>
              <div className="space-y-1.5">
                {sourceSorted.map(([source, data]) => {
                  const sourceTokens = data.promptTokens + data.completionTokens
                  const sourceMaxBar = totalTokens > 0 ? (sourceTokens / totalTokens) * 100 : 0
                  const label = SOURCE_LABELS[source] ?? source
                  const sourceCost =
                    (data.promptTokens / 1_000_000) * PRICE_INPUT_PER_M +
                    (data.completionTokens / 1_000_000) * PRICE_OUTPUT_PER_M
                  return (
                    <div key={source}>
                      <div className="mb-0.5 flex items-center justify-between text-[10px]">
                        <span className="text-foreground max-w-[120px] truncate">{label}</span>
                        <span className="text-muted-foreground ml-2 shrink-0 font-mono">
                          {formatTokens(sourceTokens)} · {formatCost(sourceCost)}
                        </span>
                      </div>
                      <div className="bg-muted h-1 overflow-hidden rounded-full">
                        <div
                          className="bg-primary h-full rounded-full transition-all"
                          style={{ width: `${sourceMaxBar}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        <DropdownMenuSeparator />
        <div className="text-muted-foreground/60 px-3 py-2 text-[10px]">
          Gemini 2.5 Flash-Lite: $0.10/1M input · $0.40/1M output
        </div>

        <DropdownMenuSeparator />
        <div className="px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-6 w-full justify-center gap-1 text-[10px]"
            onClick={() => {
              resetAiUsage()
              setOpen(false)
            }}
          >
            <RotateCcw className="h-2.5 w-2.5" />
            Reset Session
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
