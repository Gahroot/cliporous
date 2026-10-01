import {
  Captions,
  Check,
  CircleDashed,
  Columns2,
  MousePointer2,
  Repeat2,
  SlidersHorizontal,
  Sparkles,
  Type,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ClipCandidate, ClipRenderSettings } from '@/store/types';

interface ReviewSelectionToolbarProps {
  selectedCount: number;
  visibleCount: number;
  hiddenSelectedCount: number;
  allVisibleSelected: boolean;
  compareEligible: boolean;
  renderDisabled?: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onDone: () => void;
  onStatus: (status: ClipCandidate['status']) => void;
  onRender: () => void;
  onCompare: () => void;
  onApplySetting: (overrides: Partial<ClipRenderSettings>, label: string) => void;
}

export function ReviewSelectionToolbar({
  selectedCount,
  visibleCount,
  hiddenSelectedCount,
  allVisibleSelected,
  compareEligible,
  renderDisabled = false,
  onSelectAll,
  onClear,
  onDone,
  onStatus,
  onRender,
  onCompare,
  onApplySetting,
}: ReviewSelectionToolbarProps): React.JSX.Element {
  const hasSelection = selectedCount > 0;
  return (
    <section
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-primary/25 bg-primary/5 px-4 py-2 sm:px-6"
      aria-label="Bulk clip actions"
    >
      <div className="mr-auto flex min-w-0 items-center gap-2">
        <MousePointer2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div aria-live="polite">
          <p className="text-sm font-semibold">
            {selectedCount} {selectedCount === 1 ? 'clip' : 'clips'} selected
          </p>
          <p className="text-[11px] text-muted-foreground">
            Selection is not approval.
            {hiddenSelectedCount > 0 && ` ${hiddenSelectedCount} hidden by the current filter`}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onSelectAll}
          disabled={visibleCount === 0}
        >
          {allVisibleSelected ? 'Clear all' : `Select visible (${visibleCount})`}
        </Button>
        {hasSelection && (
          <Button type="button" size="sm" variant="ghost" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!hasSelection}
          onClick={() => onStatus('pending')}
          aria-keyshortcuts="U"
        >
          <CircleDashed aria-hidden="true" />
          Unreviewed ({selectedCount})
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!hasSelection}
          onClick={() => onStatus('rejected')}
          aria-keyshortcuts="X"
        >
          <X aria-hidden="true" />
          Reject ({selectedCount})
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!hasSelection}
          onClick={() => onStatus('approved')}
          aria-keyshortcuts="A"
        >
          <Check aria-hidden="true" />
          Approve ({selectedCount})
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline" disabled={!hasSelection}>
              <SlidersHorizontal aria-hidden="true" />
              Shared settings ({selectedCount})
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Apply to {selectedCount} selected clips</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onApplySetting({ enableCaptions: true }, 'Captions enabled')}
            >
              <Captions aria-hidden="true" />
              Enable captions
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onApplySetting({ enableCaptions: false }, 'Captions disabled')}
            >
              <Captions aria-hidden="true" />
              Disable captions
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onApplySetting({ enableAutoZoom: true }, 'Auto zoom enabled')}
            >
              <ZoomIn aria-hidden="true" />
              Enable auto zoom
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onApplySetting({ enableAutoZoom: false }, 'Auto zoom disabled')}
            >
              <ZoomIn aria-hidden="true" />
              Disable auto zoom
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onApplySetting({ enableRehook: true }, 'Re-hooks enabled')}
            >
              <Repeat2 aria-hidden="true" />
              Enable re-hooks
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onApplySetting({ enableRehook: false }, 'Re-hooks disabled')}
            >
              <Repeat2 aria-hidden="true" />
              Disable re-hooks
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onApplySetting({ enableWordEmphasis: true }, 'Word emphasis enabled')}
            >
              <Sparkles aria-hidden="true" />
              Enable word emphasis
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                onApplySetting({ enableWordEmphasis: false }, 'Word emphasis disabled')
              }
            >
              <Sparkles aria-hidden="true" />
              Disable word emphasis
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onApplySetting({ enableHookTitle: true }, 'Hook titles enabled')}
            >
              <Type aria-hidden="true" />
              Enable hook titles
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onApplySetting({ enableHookTitle: false }, 'Hook titles disabled')}
            >
              <Type aria-hidden="true" />
              Disable hook titles
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!compareEligible}
          onClick={onCompare}
          title={compareEligible ? 'Compare selected clips' : 'Select exactly two standard clips'}
        >
          <Columns2 aria-hidden="true" />
          {compareEligible
            ? 'Compare'
            : selectedCount === 2
              ? 'Standard clips only'
              : 'Compare (pick 2)'}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!hasSelection || renderDisabled}
          onClick={onRender}
          aria-keyshortcuts="R"
        >
          <Upload aria-hidden="true" />
          Export selected ({selectedCount})
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </section>
  );
}
