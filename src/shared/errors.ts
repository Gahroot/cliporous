import { redactCredentialText } from './credential-safety';

export type ErrorRecoveryAction =
  | 'retry'
  | 'open-settings'
  | 'relink'
  | 'free-space'
  | 'resume'
  | 'none';

/**
 * The one error contract used across main-process events, renderer state, and UI.
 * Creator-facing fields stay short; diagnostics are always secondary.
 */
export interface StructuredError {
  version: 1;
  headline: string;
  whatHappened: string;
  whatIsSafe: string;
  whatToDoNext: string;
  retryable: boolean;
  failedStage: string | null;
  source: string;
  provider?: string;
  statusCode?: string;
  recoveryAction: ErrorRecoveryAction;
  technicalDetails?: string;
  correlationId: string;
}

export interface StructuredErrorInput {
  source: string;
  error?: unknown;
  message?: string;
  details?: string;
  headline?: string;
  whatHappened?: string;
  whatIsSafe?: string;
  whatToDoNext?: string;
  retryable?: boolean;
  failedStage?: string | null;
  provider?: string;
  statusCode?: string | number;
  recoveryAction?: ErrorRecoveryAction;
  correlationId?: string;
}

const CORRELATION_PATTERN = /^\s*\[([A-Z]{2,8}-[A-Z0-9-]{6,})\]\s*/i;
const MAX_DIAGNOSTIC_LENGTH = 8_000;

export function createErrorCorrelationId(prefix = 'BC'): string {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${time}-${random}`;
}

export function extractErrorCorrelationId(text: string): string | null {
  return text.match(CORRELATION_PATTERN)?.[1]?.toUpperCase() ?? null;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error === null || error === undefined) return '';
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function redactDiagnosticText(text: string): string {
  const withoutCorrelation = text.replace(CORRELATION_PATTERN, '');
  const redacted = redactCredentialText(withoutCorrelation)
    .replace(/\/Users\/[^/\s]+/g, '~')
    .replace(/\b[A-Z]:\\Users\\[^\\\s]+/gi, '~');
  if (redacted.length <= MAX_DIAGNOSTIC_LENGTH) return redacted;
  return `${redacted.slice(0, MAX_DIAGNOSTIC_LENGTH)}\n[diagnostics truncated]`;
}

function inferProvider(source: string, raw: string): string | undefined {
  const haystack = `${source} ${raw}`.toLowerCase();
  if (haystack.includes('gemini') || haystack.includes('google generative')) return 'Gemini';
  if (haystack.includes('pexels')) return 'Pexels';
  if (haystack.includes('fal.ai') || haystack.includes('fal_')) return 'fal.ai';
  if (haystack.includes('youtube') || haystack.includes('yt-dlp')) return 'YouTube';
  return undefined;
}

function inferStatusCode(raw: string): string | undefined {
  const match = raw.match(/(?:status(?:\s+code)?|http)\s*[:=]?\s*(\d{3})\b/i);
  return match?.[1];
}

interface ErrorClassification {
  headline: string;
  whatHappened: string;
  whatIsSafe: string;
  whatToDoNext: string;
  retryable: boolean;
  recoveryAction: ErrorRecoveryAction;
}

function classify(source: string, raw: string): ErrorClassification {
  const lower = raw.toLowerCase();
  const creatorWorkSafe = 'Your source media and completed work are still safe.';

  if (/cancel(?:lation|ling)? failed|did not confirm cancellation|still running/.test(lower)) {
    return {
      headline: "BatchClip couldn't stop the work yet",
      whatHappened: 'The current operation is still running.',
      whatIsSafe: 'Completed clips and cached analysis have been kept.',
      whatToDoNext: 'Try cancelling again. Keep BatchClip open until the operation stops.',
      retryable: true,
      recoveryAction: 'retry',
    };
  }

  if (/no internet|offline|network|fetch failed|econnreset|\benotfound\b/.test(lower)) {
    return {
      headline: 'An internet connection is needed',
      whatHappened: 'BatchClip lost access to an online service during this step.',
      whatIsSafe: creatorWorkSafe,
      whatToDoNext: 'Reconnect to the internet, then resume this step.',
      retryable: true,
      recoveryAction: 'resume',
    };
  }

  if (/api key|missing.*key|not configured|unauthorized|status\s*[:=]?\s*401|\b401\b/.test(lower)) {
    return {
      headline: 'A connection needs attention',
      whatHappened: 'BatchClip could not use the configured content service.',
      whatIsSafe: creatorWorkSafe,
      whatToDoNext: 'Open Settings, update the connection, then resume.',
      retryable: true,
      recoveryAction: 'open-settings',
    };
  }

  if (/rate limit|usage limit|quota|resource_exhausted|\b429\b/.test(lower)) {
    return {
      headline: 'The content service is temporarily busy',
      whatHappened: 'The provider paused this request because its current limit was reached.',
      whatIsSafe: creatorWorkSafe,
      whatToDoNext: 'Wait for the provider limit to reset, then resume.',
      retryable: true,
      recoveryAction: 'resume',
    };
  }

  if (/no space left|enospc|disk (?:is )?full|out of (?:disk )?space/.test(lower)) {
    return {
      headline: 'There is not enough disk space',
      whatHappened: 'BatchClip ran out of room while writing media files.',
      whatIsSafe: 'Your source and every completed output are still safe.',
      whatToDoNext: 'Free up space or choose another output folder, then retry.',
      retryable: true,
      recoveryAction: 'free-space',
    };
  }

  if (/permission denied|eacces|erofs|read-only file system/.test(lower)) {
    return {
      headline: "BatchClip couldn't write to that folder",
      whatHappened: 'The selected location did not allow BatchClip to create a file.',
      whatIsSafe: creatorWorkSafe,
      whatToDoNext: 'Choose a writable output folder, then retry.',
      retryable: true,
      recoveryAction: 'open-settings',
    };
  }

  if (
    /no such file|enoent|missing (?:source|media|file)|source.*offline|couldn.t be read/.test(lower)
  ) {
    return {
      headline: 'The source media is unavailable',
      whatHappened: 'BatchClip could not find or read the video used for this step.',
      whatIsSafe: 'Your transcript, clip decisions, and project edits are still safe.',
      whatToDoNext: 'Relink the source video, then resume.',
      retryable: true,
      recoveryAction: 'relink',
    };
  }

  if (source === 'render' || /ffmpeg|render|encode|codec/.test(lower)) {
    return {
      headline: 'This output could not be rendered',
      whatHappened: 'The video engine stopped before this output finished.',
      whatIsSafe: 'Completed outputs and your clip edits are still safe.',
      whatToDoNext:
        'Retry this output. If it fails again, open Details and export the diagnostics.',
      retryable: true,
      recoveryAction: 'retry',
    };
  }

  if (source === 'project') {
    return {
      headline: 'The project action did not finish',
      whatHappened: 'BatchClip could not complete the requested project operation.',
      whatIsSafe: 'The project currently open in BatchClip has not been discarded.',
      whatToDoNext: 'Try the action again. If it keeps failing, export the diagnostics.',
      retryable: true,
      recoveryAction: 'retry',
    };
  }

  return {
    headline: source === 'pipeline' ? 'Processing stopped' : 'BatchClip hit a problem',
    whatHappened:
      source === 'pipeline'
        ? 'BatchClip could not finish the current content-processing step.'
        : 'BatchClip could not finish the requested action.',
    whatIsSafe: creatorWorkSafe,
    whatToDoNext: 'Try again. If the problem continues, open Details and export the diagnostics.',
    retryable: true,
    recoveryAction: 'retry',
  };
}

export function isStructuredError(value: unknown): value is StructuredError {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StructuredError>;
  return (
    candidate.version === 1 &&
    typeof candidate.headline === 'string' &&
    typeof candidate.whatHappened === 'string' &&
    typeof candidate.whatIsSafe === 'string' &&
    typeof candidate.whatToDoNext === 'string' &&
    typeof candidate.correlationId === 'string'
  );
}

export function createStructuredError(input: StructuredErrorInput): StructuredError {
  const raw = Array.from(
    new Set(
      [input.message, errorText(input.error), input.details]
        .map((part) => part?.trim())
        .filter((part): part is string => Boolean(part)),
    ),
  ).join('\n');
  const inferredCorrelationId = extractErrorCorrelationId(raw);
  const correlationId = input.correlationId ?? inferredCorrelationId ?? createErrorCorrelationId();
  const base = classify(input.source, raw);
  const provider = input.provider ?? inferProvider(input.source, raw);
  const statusCode = input.statusCode?.toString() ?? inferStatusCode(raw);
  const technicalDetails = redactDiagnosticText(raw);

  return {
    version: 1,
    headline: input.headline ?? base.headline,
    whatHappened: input.whatHappened ?? base.whatHappened,
    whatIsSafe: input.whatIsSafe ?? base.whatIsSafe,
    whatToDoNext: input.whatToDoNext ?? base.whatToDoNext,
    retryable: input.retryable ?? base.retryable,
    failedStage: input.failedStage ?? null,
    source: redactCredentialText(input.source),
    ...(provider ? { provider } : {}),
    ...(statusCode ? { statusCode } : {}),
    recoveryAction: input.recoveryAction ?? base.recoveryAction,
    ...(technicalDetails ? { technicalDetails } : {}),
    correlationId,
  };
}

export function formatErrorDiagnostics(error: StructuredError): string {
  const metadata = [
    `Correlation ID: ${error.correlationId}`,
    `Source: ${error.source}`,
    `Failed stage: ${error.failedStage ?? 'unknown'}`,
    `Retryable: ${error.retryable ? 'yes' : 'no'}`,
    error.provider ? `Provider: ${error.provider}` : null,
    error.statusCode ? `Status code: ${error.statusCode}` : null,
  ].filter(Boolean);

  return [...metadata, '', error.technicalDetails ?? 'No technical details were provided.'].join(
    '\n',
  );
}
