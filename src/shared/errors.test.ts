import { describe, expect, it } from 'vitest';
import { createStructuredError, formatErrorDiagnostics } from './errors';

describe('structured error contract', () => {
  it('turns raw engine output into creator-facing recovery copy', () => {
    const error = createStructuredError({
      source: 'render',
      failedStage: 'rendering',
      message: 'ffmpeg exited with code 1: No space left on device',
    });

    expect(error.headline).toBe('There is not enough disk space');
    expect(error.whatIsSafe).toContain('completed output');
    expect(error.whatToDoNext).toContain('Free up space');
    expect(error.recoveryAction).toBe('free-space');
    expect(error.failedStage).toBe('rendering');
    expect(error.technicalDetails).toContain('ffmpeg exited');
  });

  it('does not mistake a Python ModuleNotFoundError for being offline', () => {
    const error = createStructuredError({
      source: 'pipeline',
      message: "ModuleNotFoundError: No module named 'face_model'",
    });

    expect(error.headline).not.toBe('An internet connection is needed');
  });

  it('redacts credentials and personal home paths from diagnostics', () => {
    const error = createStructuredError({
      source: 'Gemini',
      message: 'Authorization: Bearer secret-value at /Users/groot/project/file.mp4',
    });

    const diagnostics = formatErrorDiagnostics(error);
    expect(diagnostics).not.toContain('secret-value');
    expect(diagnostics).not.toContain('/Users/groot');
    expect(diagnostics).toContain('Authorization:');
    expect(diagnostics).toContain('[REDACTED]');
    expect(diagnostics).toContain('~/project/file.mp4');
  });

  it('keeps an IPC correlation id so renderer diagnostics match main logs', () => {
    const error = createStructuredError({
      source: 'project',
      message: '[BC-ABC123-DEF456] Error invoking remote method: save failed',
    });

    expect(error.correlationId).toBe('BC-ABC123-DEF456');
    expect(error.technicalDetails).not.toContain('BC-ABC123-DEF456');
  });
});
