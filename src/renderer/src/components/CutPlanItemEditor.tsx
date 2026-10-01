import {
  LONGFORM_PRESENTATION_LABELS,
  LONGFORM_PRESENTATIONS,
  type LongformPresentation,
} from '@shared/longform-scenes';
import { Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import type { LongformPlanItemUpdate, LongformPlanItemView } from '@/lib/longform-plan';

interface CutPlanItemEditorProps {
  item: LongformPlanItemView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (update: LongformPlanItemUpdate) => void;
  onRemove: () => void;
  returnFocusRef?: React.RefObject<HTMLButtonElement | null>;
}

export function CutPlanItemEditor({
  item,
  open,
  onOpenChange,
  onSave,
  onRemove,
  returnFocusRef,
}: CutPlanItemEditorProps): React.JSX.Element {
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [startTime, setStartTime] = useState('0');
  const [endTime, setEndTime] = useState('0');
  const [presentation, setPresentation] = useState<LongformPresentation>('speaker-side');

  useEffect(() => {
    if (!item) return;
    setTitle(item.title);
    setDetail(item.type === 'block' ? item.detail : '');
    setStartTime(item.startTime.toFixed(2));
    setEndTime(item.endTime.toFixed(2));
    setPresentation(item.scene?.presentation ?? 'speaker-side');
  }, [item]);

  const start = Number(startTime);
  const end = Number(endTime);
  const isScene = item?.type === 'scene';
  const valid =
    isScene ||
    (title.trim().length > 0 &&
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start >= 0 &&
      end > start);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg"
        onCloseAutoFocus={(event) => {
          const trigger = returnFocusRef?.current;
          if (!trigger?.isConnected || trigger.disabled) return;
          event.preventDefault();
          trigger.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Edit {item?.kind ?? 'plan beat'}</DialogTitle>
          <DialogDescription>
            {isScene
              ? 'Change the landscape presentation. Source wording, indexed beats, and the complete scene window stay unchanged. Use feedback to request a different explanation.'
              : 'Change wording or timing. This creates a saved user-edited version and preserves the beat during regeneration.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isScene ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="cut-plan-scene-presentation">Presentation</Label>
                <select
                  id="cut-plan-scene-presentation"
                  value={presentation}
                  onChange={(event) => setPresentation(event.target.value as LongformPresentation)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {LONGFORM_PRESENTATIONS.map((value) => (
                    <option key={value} value={value}>
                      {LONGFORM_PRESENTATION_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">Purpose: {item.detail}</p>
              <p className="text-xs text-muted-foreground">
                Source: {item.sourceText || 'Transcript unavailable'}
              </p>
              <p className="text-xs tabular-nums text-muted-foreground">
                Source timing (read-only): {item.startTime.toFixed(2)}–{item.endTime.toFixed(2)}s
              </p>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="cut-plan-item-title">
                  {item?.type === 'phrase'
                    ? 'On-screen phrase'
                    : item?.type === 'block'
                      ? 'Heading'
                      : 'Evidence text'}
                </Label>
                <Input
                  id="cut-plan-item-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={160}
                />
              </div>
              {item?.type === 'block' && (
                <div className="space-y-1.5">
                  <Label htmlFor="cut-plan-item-detail">Kicker</Label>
                  <Input
                    id="cut-plan-item-detail"
                    value={detail}
                    onChange={(event) => setDetail(event.target.value)}
                    maxLength={80}
                  />
                </div>
              )}
              <fieldset className="grid grid-cols-2 gap-3">
                <legend className="mb-1.5 text-sm font-medium">Source timing in seconds</legend>
                <div className="space-y-1.5">
                  <Label htmlFor="cut-plan-item-start">Start</Label>
                  <Input
                    id="cut-plan-item-start"
                    type="number"
                    min={0}
                    step={0.1}
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cut-plan-item-end">End</Label>
                  <Input
                    id="cut-plan-item-end"
                    type="number"
                    min={0}
                    step={0.1}
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    aria-describedby={!valid ? 'cut-plan-timing-error' : undefined}
                  />
                </div>
              </fieldset>
            </>
          )}
          {!valid && (
            <p id="cut-plan-timing-error" role="alert" className="text-xs text-destructive">
              Add wording and use an end time after the start time.
            </p>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              onRemove();
              onOpenChange(false);
            }}
          >
            <Trash2 />
            {isScene ? (item.scene?.omitted ? 'Include scene' : 'Omit scene') : 'Remove beat'}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={!valid}
              onClick={() => {
                if (!valid) return;
                onSave(
                  isScene
                    ? { presentation }
                    : {
                        title: title.trim(),
                        ...(item?.type === 'block' ? { detail: detail.trim() } : {}),
                        startTime: start,
                        endTime: end,
                      },
                );
                onOpenChange(false);
              }}
            >
              <Save />
              Save version
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
