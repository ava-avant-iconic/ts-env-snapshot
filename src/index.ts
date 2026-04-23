/**
 * ts-env-snapshot
 *
 * Capture, compare, and diff environment variable snapshots across deploys.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** A snapshot of environment variables at a point in time. */
export interface EnvSnapshot {
  /** ISO-8601 timestamp when the snapshot was taken. */
  timestamp: string;
  /** Arbitrary label for this snapshot (e.g. "prod-before-deploy"). */
  label: string;
  /** The captured key-value pairs. */
  vars: Record<string, string>;
}

/** The change type for a single env var between two snapshots. */
export type DiffKind = 'added' | 'removed' | 'changed' | 'unchanged';

/** A single diff entry for one env var. */
export interface EnvDiffEntry {
  key: string;
  kind: DiffKind;
  oldValue?: string;
  newValue?: string;
}

/** The full result of comparing two snapshots. */
export interface EnvDiffResult {
  /** Label of the "before" snapshot. */
  beforeLabel: string;
  /** Label of the "after" snapshot. */
  afterLabel: string;
  /** Individual entries, sorted by key. */
  entries: EnvDiffEntry[];
  /** Quick summary counts. */
  summary: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
  };
}

/** Options for capturing a snapshot. */
export interface SnapshotOptions {
  /** Label for the snapshot. Defaults to 'unnamed'. */
  label?: string;
  /** Only capture these keys (whitelist). */
  includeKeys?: string[];
  /** Exclude these keys (blacklist). */
  excludeKeys?: string[];
  /** Mask values for keys matching these patterns (replaces value with '***'). */
  maskKeys?: string[];
}

/** Options for formatting a diff report. */
export interface ReportOptions {
  /** Show unchanged vars in the report. Default: false. */
  showUnchanged?: boolean;
  /** Max chars to show for values before truncation. Default: 40. */
  maxValueLength?: number;
}

// ─── EnvSnapshotManager ───────────────────────────────────────────────────────

/**
 * Core class for capturing environment snapshots and comparing them.
 *
 * @example
 * ```ts
 * const manager = new EnvSnapshotManager();
 *
 * const before = manager.capture(process.env, { label: 'before-deploy' });
 * // ... deploy happens ...
 * const after = manager.capture(process.env, { label: 'after-deploy' });
 *
 * const diff = manager.diff(before, after);
 * console.log(manager.formatReport(diff));
 * ```
 */
export class EnvSnapshotManager {
  /**
   * Capture a snapshot of the given environment object.
   *
   * @param env - Object containing env vars (e.g. `process.env`).
   * @param options - Capture options.
   * @returns An immutable EnvSnapshot.
   */
  capture(env: Record<string, string | undefined>, options: SnapshotOptions = {}): EnvSnapshot {
    const { label = 'unnamed', includeKeys, excludeKeys, maskKeys } = options;
    const maskSet = new Set(maskKeys ?? []);

    let keys = Object.keys(env).filter((k) => env[k] !== undefined);

    if (includeKeys) {
      const includeSet = new Set(includeKeys);
      keys = keys.filter((k) => includeSet.has(k));
    }

    if (excludeKeys) {
      const excludeSet = new Set(excludeKeys);
      keys = keys.filter((k) => !excludeSet.has(k));
    }

    keys.sort();

    const vars: Record<string, string> = {};
    for (const key of keys) {
      const raw = env[key]!;
      vars[key] = maskSet.has(key) ? '***' : raw;
    }

    return {
      timestamp: new Date().toISOString(),
      label,
      vars,
    };
  }

  /**
   * Compare two snapshots and return the diff.
   *
   * @param before - The earlier snapshot.
   * @param after  - The later snapshot.
   * @returns A detailed diff result with summary counts.
   */
  diff(before: EnvSnapshot, after: EnvSnapshot): EnvDiffResult {
    const beforeKeys = new Set(Object.keys(before.vars));
    const afterKeys = new Set(Object.keys(after.vars));
    const allKeys = new Set([...beforeKeys, ...afterKeys]);

    const entries: EnvDiffEntry[] = [];
    let added = 0;
    let removed = 0;
    let changed = 0;
    let unchanged = 0;

    for (const key of Array.from(allKeys).sort()) {
      const inBefore = beforeKeys.has(key);
      const inAfter = afterKeys.has(key);

      if (inBefore && !inAfter) {
        entries.push({ key, kind: 'removed', oldValue: before.vars[key] });
        removed++;
      } else if (!inBefore && inAfter) {
        entries.push({ key, kind: 'added', newValue: after.vars[key] });
        added++;
      } else {
        const oldVal = before.vars[key];
        const newVal = after.vars[key];
        if (oldVal === newVal) {
          entries.push({ key, kind: 'unchanged', oldValue: oldVal, newValue: newVal });
          unchanged++;
        } else {
          entries.push({ key, kind: 'changed', oldValue: oldVal, newValue: newVal });
          changed++;
        }
      }
    }

    return {
      beforeLabel: before.label,
      afterLabel: after.label,
      entries,
      summary: { added, removed, changed, unchanged },
    };
  }

  /**
   * Format a diff result as a human-readable string report.
   *
   * @param result - The diff result from `diff()`.
   * @param options - Report formatting options.
   * @returns A multi-line string suitable for console output or logs.
   */
  formatReport(result: EnvDiffResult, options: ReportOptions = {}): string {
    const { showUnchanged = false, maxValueLength = 40 } = options;
    const lines: string[] = [];

    lines.push(`╔══ Env Snapshot Diff ═════════════════════════════╗`);
    lines.push(`║ Before: ${result.beforeLabel}`);
    lines.push(`║ After:  ${result.afterLabel}`);
    lines.push(`╠══ Summary ══════════════════════════════════════╣`);
    lines.push(`║  + Added:      ${result.summary.added}`);
    lines.push(`║  - Removed:    ${result.summary.removed}`);
    lines.push(`║  ~ Changed:    ${result.summary.changed}`);
    lines.push(`║  = Unchanged:  ${result.summary.unchanged}`);
    lines.push(`╚══════════════════════════════════════════════════╝`);
    lines.push('');

    const truncate = (val: string): string =>
      val.length > maxValueLength ? val.slice(0, maxValueLength) + '…' : val;

    for (const entry of result.entries) {
      if (entry.kind === 'unchanged' && !showUnchanged) continue;

      switch (entry.kind) {
        case 'added':
          lines.push(`  + ${entry.key} = ${truncate(entry.newValue!)}`);
          break;
        case 'removed':
          lines.push(`  - ${entry.key} = ${truncate(entry.oldValue!)}`);
          break;
        case 'changed':
          lines.push(`  ~ ${entry.key}`);
          lines.push(`      was: ${truncate(entry.oldValue!)}`);
          lines.push(`      now: ${truncate(entry.newValue!)}`);
          break;
        case 'unchanged':
          lines.push(`  = ${entry.key} = ${truncate(entry.oldValue!)}`);
          break;
      }
    }

    return lines.join('\n');
  }

  /**
   * Serialize a snapshot to a JSON string (for storage/transmission).
   */
  serialize(snapshot: EnvSnapshot): string {
    return JSON.stringify(snapshot, null, 2);
  }

  /**
   * Deserialize a JSON string back into an EnvSnapshot.
   *
   * @throws {TypeError} If the JSON is not a valid snapshot.
   */
  deserialize(json: string): EnvSnapshot {
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('timestamp' in parsed) ||
      !('label' in parsed) ||
      !('vars' in parsed)
    ) {
      throw new TypeError('Invalid EnvSnapshot: missing required fields');
    }
    return parsed as EnvSnapshot;
  }
}
