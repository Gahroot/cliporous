import { Check, NotebookPen } from 'lucide-react';
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
import { creativeBriefHasUncommittedChanges } from '@/services/creative-brief';
import { useStore } from '@/store';
import type { CreativeBrief } from '@/store/types';

interface CreativeBriefDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHORT_FIELDS: Array<{
  key: keyof Pick<CreativeBrief, 'audience' | 'goal' | 'callToAction' | 'tone'>;
  label: string;
  placeholder: string;
}> = [
  { key: 'audience', label: 'Audience', placeholder: 'Who should this cut reach?' },
  { key: 'goal', label: 'Goal', placeholder: 'What should this cut accomplish?' },
  { key: 'callToAction', label: 'Call to action', placeholder: 'What should viewers do next?' },
  { key: 'tone', label: 'Tone', placeholder: 'Direct, warm, technical, playful…' },
];

const LONG_FIELDS: Array<{
  key: keyof Pick<CreativeBrief, 'mustInclude' | 'prohibitedClaims' | 'notes'>;
  label: string;
  placeholder: string;
}> = [
  { key: 'mustInclude', label: 'Must include', placeholder: 'Key points, names, or moments' },
  {
    key: 'prohibitedClaims',
    label: 'Avoid',
    placeholder: 'Claims, phrases, or topics that must not appear',
  },
  { key: 'notes', label: 'Notes', placeholder: 'Anything else the editor should know' },
];

export function CreativeBriefDialog({
  open,
  onOpenChange,
}: CreativeBriefDialogProps): React.JSX.Element {
  const brief = useStore((state) => state.creativeBrief);
  const isLongform = useStore((state) => state.settings.outputMode === 'longform');
  const setCreativeBrief = useStore((state) => state.setCreativeBrief);
  const commitCreativeBrief = useStore((state) => state.commitCreativeBrief);
  const hasUncommittedChanges = creativeBriefHasUncommittedChanges(brief);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(720px,calc(100vh-2rem))] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <NotebookPen className="h-5 w-5 text-primary" aria-hidden />
            Creative Brief
          </DialogTitle>
          <DialogDescription>
            Project guidance saves with this cut. It does not change global studio preferences.
          </DialogDescription>
        </DialogHeader>

        {isLongform ? (
          <div className="space-y-4">
            <p className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              Creative Brief is not used for initial scene planning. The transcript guides the
              long-form draft; use scene feedback during review to request revisions.
            </p>
            <p className="text-xs text-muted-foreground">
              Existing brief text is kept unchanged for short-form use.
            </p>
            {[...SHORT_FIELDS, ...LONG_FIELDS].some((field) => brief[field.key]) && (
              <details className="rounded-md border border-border p-3">
                <summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  View preserved brief (not used for initial planning)
                </summary>
                <dl className="mt-3 space-y-3">
                  {[...SHORT_FIELDS, ...LONG_FIELDS]
                    .filter((field) => brief[field.key])
                    .map((field) => (
                      <div key={field.key}>
                        <dt className="text-xs font-medium">{field.label}</dt>
                        <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                          {brief[field.key]}
                        </dd>
                      </div>
                    ))}
                </dl>
              </details>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Back to project
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {SHORT_FIELDS.map((field) => (
                <div key={field.key} className="grid gap-1.5">
                  <Label htmlFor={`brief-${field.key}`}>{field.label}</Label>
                  <Input
                    id={`brief-${field.key}`}
                    value={brief[field.key]}
                    placeholder={field.placeholder}
                    onChange={(event) => setCreativeBrief({ [field.key]: event.target.value })}
                  />
                </div>
              ))}
            </div>

            <div className="grid gap-4">
              {LONG_FIELDS.map((field) => (
                <div key={field.key} className="grid gap-1.5">
                  <Label htmlFor={`brief-${field.key}`}>{field.label}</Label>
                  <textarea
                    id={`brief-${field.key}`}
                    value={brief[field.key]}
                    placeholder={field.placeholder}
                    rows={field.key === 'notes' ? 4 : 3}
                    onChange={(event) => setCreativeBrief({ [field.key]: event.target.value })}
                    className="flex min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-muted-foreground" role="status">
                <p>Draft changes autosave with this project.</p>
                <p>Short-form AI guidance uses only the last saved brief.</p>
                {brief.savedAt && (
                  <p className="mt-1">
                    Saved{' '}
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(brief.savedAt))}
                  </p>
                )}
              </div>
              <Button type="button" disabled={!hasUncommittedChanges} onClick={commitCreativeBrief}>
                <Check className="h-4 w-4" aria-hidden />
                {brief.savedAt ? 'Save brief changes' : 'Save brief'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
