import { randomUUID } from 'node:crypto';
import { lstat, open, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isUsageRecord, recentSnapshot, type UsageRecord } from './ai/explainer/recent-usage';

const FILE_NAME = 'planner-usage-v1.json';
const MAX_BYTES = 512 * 1024;
export type HistoryWarning = 'invalid-history' | 'history-read-failed' | 'history-write-failed';
export interface PlannerUsageStore {
  load(): Promise<UsageRecord[]>;
  snapshot(excludeClipHash?: string): UsageRecord[];
  reserveOrders(count: number): number;
  commit(record: UsageRecord, signal?: AbortSignal): Promise<boolean>;
  disabled(): boolean;
}

/** Registration-lifecycle owner; no module-global state and no project-file access. */
export function createPlannerUsageStore(
  directory: string,
  options: {
    warn?: (reason: HistoryWarning) => void;
    replace?: (source: string, destination: string) => Promise<void>;
  } = {},
): PlannerUsageStore {
  const root = resolve(directory);
  const path = join(root, FILE_NAME);
  let records: UsageRecord[] = [];
  let disabled = false;
  let loaded = false;
  let loading: Promise<void> | undefined;
  let tail: Promise<void> = Promise.resolve();
  let nextOrder = 0;
  const disable = (reason: HistoryWarning): void => {
    if (disabled) return;
    disabled = true;
    try {
      options.warn?.(reason);
    } catch {
      /* Derived metadata and its warning must never block an export. */
    }
  };
  async function loadInitial(): Promise<void> {
    try {
      const parent = await lstat(root);
      if (!parent.isDirectory() || parent.isSymbolicLink()) {
        disable('invalid-history');
        return;
      }
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) {
        disable('invalid-history');
        return;
      }
      const handle = await open(path, 'r');
      let text = '';
      try {
        const buffer = Buffer.alloc(MAX_BYTES + 1);
        let offset = 0;
        while (offset < buffer.length) {
          const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
          if (!bytesRead) break;
          offset += bytesRead;
        }
        if (offset > MAX_BYTES) {
          disable('invalid-history');
          return;
        }
        text = buffer.subarray(0, offset).toString('utf8');
      } finally {
        await handle.close();
      }
      const value: unknown = JSON.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        disable('invalid-history');
        return;
      }
      const raw = value as Record<string, unknown>;
      if (
        Object.keys(raw).some((key) => !['version', 'records'].includes(key)) ||
        raw.version !== 1 ||
        !Array.isArray(raw.records) ||
        raw.records.length > 64 ||
        !raw.records.every(isUsageRecord)
      ) {
        disable('invalid-history');
        return;
      }
      const entries = raw.records;
      if (
        new Set(entries.map((r) => r.clipHash)).size !== entries.length ||
        new Set(entries.map((r) => r.order)).size !== entries.length
      ) {
        disable('invalid-history');
        return;
      }
      records = structuredClone(entries).sort(
        (a, b) => a.order - b.order || a.clipHash.localeCompare(b.clipHash),
      );
      nextOrder = Math.max(0, ...records.map((record) => record.order + 1));
      if (!Number.isSafeInteger(nextOrder + 1024)) {
        records = [];
        nextOrder = 0;
        disable('invalid-history');
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
      disable(error instanceof SyntaxError ? 'invalid-history' : 'history-read-failed');
    } finally {
      loaded = true;
    }
  }
  async function load(): Promise<UsageRecord[]> {
    loading ??= loadInitial();
    await loading;
    return disabled ? [] : structuredClone(records);
  }
  return {
    load,
    snapshot(excludeClipHash) {
      return disabled ? [] : recentSnapshot(records, excludeClipHash);
    },
    reserveOrders(count) {
      if (
        !loaded ||
        !Number.isInteger(count) ||
        count < 0 ||
        count > 1024 ||
        !Number.isSafeInteger(nextOrder + count)
      )
        throw new Error('Invalid planning order reservation');
      const start = nextOrder;
      nextOrder += count;
      return start;
    },
    async commit(record, signal) {
      await load();
      if (disabled || signal?.aborted) return false;
      if (!isUsageRecord(record) || !Number.isSafeInteger(record.order + 1024)) {
        disable('invalid-history');
        return false;
      }
      const incoming = structuredClone(record);
      const prior = tail;
      let release: () => void = () => {};
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await prior;
      let temporary: string | undefined;
      try {
        if (disabled || signal?.aborted) return false;
        const existing = records.find((record) => record.clipHash === incoming.clipHash);
        if (
          existing &&
          (existing.order > incoming.order || JSON.stringify(existing) === JSON.stringify(incoming))
        )
          return true;
        // Duplicate order for another clip indicates a broken owner; do not corrupt ordering.
        if (
          records.some(
            (record) => record.clipHash !== incoming.clipHash && record.order === incoming.order,
          )
        ) {
          disable('invalid-history');
          return false;
        }
        const next = [
          ...records.filter((record) => record.clipHash !== incoming.clipHash),
          incoming,
        ]
          .sort((a, b) => a.order - b.order || a.clipHash.localeCompare(b.clipHash))
          .slice(-64);
        const json = JSON.stringify({ version: 1, records: next });
        if (Buffer.byteLength(json) > MAX_BYTES) {
          disable('invalid-history');
          return false;
        }
        temporary = join(root, `.planner-usage-${randomUUID()}.tmp`);
        const handle = await open(temporary, 'wx', 0o600);
        try {
          await handle.writeFile(json, { encoding: 'utf8', signal });
          await handle.sync();
        } finally {
          await handle.close();
        }
        if (signal?.aborted) return false;
        await (options.replace ?? rename)(temporary, path);
        temporary = undefined;
        records = next;
        nextOrder = Math.max(nextOrder, incoming.order + 1);
        return true;
      } catch {
        if (!signal?.aborted) disable('history-write-failed');
        return false;
      } finally {
        if (temporary) {
          try {
            await unlink(temporary);
          } catch (error) {
            if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
              disable('history-write-failed');
          }
        }
        release();
      }
    },
    disabled: () => disabled,
  };
}
