import { EnvSnapshotManager, EnvSnapshot, EnvDiffResult } from './index';

describe('EnvSnapshotManager', () => {
  let manager: EnvSnapshotManager;

  beforeEach(() => {
    manager = new EnvSnapshotManager();
  });

  // ── capture ─────────────────────────────────────────────────────────────────

  describe('capture', () => {
    it('captures all string values from the env object', () => {
      const env = { HOST: 'localhost', PORT: '3000' };
      const snap = manager.capture(env, { label: 'test' });

      expect(snap.label).toBe('test');
      expect(snap.vars).toEqual({ HOST: 'localhost', PORT: '3000' });
      expect(snap.timestamp).toBeTruthy();
    });

    it('filters out undefined values', () => {
      const env = { A: '1', B: undefined as unknown as string };
      const snap = manager.capture(env);

      expect(snap.vars).toEqual({ A: '1' });
    });

    it('respects includeKeys whitelist', () => {
      const env = { A: '1', B: '2', C: '3' };
      const snap = manager.capture(env, { includeKeys: ['A', 'C'] });

      expect(snap.vars).toEqual({ A: '1', C: '3' });
    });

    it('respects excludeKeys blacklist', () => {
      const env = { A: '1', B: '2', C: '3' };
      const snap = manager.capture(env, { excludeKeys: ['B'] });

      expect(snap.vars).toEqual({ A: '1', C: '3' });
    });

    it('masks specified keys', () => {
      const env = { SECRET: 'password123', PUBLIC: 'hello' };
      const snap = manager.capture(env, { maskKeys: ['SECRET'] });

      expect(snap.vars.SECRET).toBe('***');
      expect(snap.vars.PUBLIC).toBe('hello');
    });

    it('sorts keys alphabetically', () => {
      const env = { Z: '1', A: '2', M: '3' };
      const snap = manager.capture(env);

      expect(Object.keys(snap.vars)).toEqual(['A', 'M', 'Z']);
    });

    it('defaults label to "unnamed"', () => {
      const snap = manager.capture({});
      expect(snap.label).toBe('unnamed');
    });
  });

  // ── diff ────────────────────────────────────────────────────────────────────

  describe('diff', () => {
    const snap = (vars: Record<string, string>, label: string): EnvSnapshot => ({
      timestamp: new Date().toISOString(),
      label,
      vars,
    });

    it('detects added vars', () => {
      const before = snap({}, 'before');
      const after = snap({ NEW: 'val' }, 'after');
      const result = manager.diff(before, after);

      expect(result.summary.added).toBe(1);
      expect(result.entries).toEqual([
        expect.objectContaining({ key: 'NEW', kind: 'added', newValue: 'val' }),
      ]);
    });

    it('detects removed vars', () => {
      const before = snap({ OLD: 'val' }, 'before');
      const after = snap({}, 'after');
      const result = manager.diff(before, after);

      expect(result.summary.removed).toBe(1);
      expect(result.entries).toEqual([
        expect.objectContaining({ key: 'OLD', kind: 'removed', oldValue: 'val' }),
      ]);
    });

    it('detects changed vars', () => {
      const before = snap({ PORT: '3000' }, 'before');
      const after = snap({ PORT: '8080' }, 'after');
      const result = manager.diff(before, after);

      expect(result.summary.changed).toBe(1);
      expect(result.entries).toEqual([
        expect.objectContaining({
          key: 'PORT',
          kind: 'changed',
          oldValue: '3000',
          newValue: '8080',
        }),
      ]);
    });

    it('detects unchanged vars', () => {
      const before = snap({ A: '1' }, 'before');
      const after = snap({ A: '1' }, 'after');
      const result = manager.diff(before, after);

      expect(result.summary.unchanged).toBe(1);
    });

    it('handles a mixed scenario', () => {
      const before = snap({ A: '1', B: '2', C: '3' }, 'before');
      const after = snap({ A: '1', B: '99', D: '4' }, 'after');
      const result = manager.diff(before, after);

      expect(result.summary).toEqual({
        added: 1,
        removed: 1,
        changed: 1,
        unchanged: 1,
      });
    });

    it('sets beforeLabel and afterLabel', () => {
      const result = manager.diff(snap({}, 'v1'), snap({}, 'v2'));
      expect(result.beforeLabel).toBe('v1');
      expect(result.afterLabel).toBe('v2');
    });
  });

  // ── formatReport ────────────────────────────────────────────────────────────

  describe('formatReport', () => {
    it('produces a non-empty string', () => {
      const result: EnvDiffResult = {
        beforeLabel: 'a',
        afterLabel: 'b',
        entries: [{ key: 'X', kind: 'added', newValue: 'y' }],
        summary: { added: 1, removed: 0, changed: 0, unchanged: 0 },
      };
      const report = manager.formatReport(result);
      expect(report).toContain('+ X');
      expect(report).toContain('Added:      1');
    });

    it('hides unchanged by default', () => {
      const result: EnvDiffResult = {
        beforeLabel: 'a',
        afterLabel: 'b',
        entries: [
          { key: 'X', kind: 'unchanged', oldValue: '1', newValue: '1' },
          { key: 'Y', kind: 'added', newValue: '2' },
        ],
        summary: { added: 1, removed: 0, changed: 0, unchanged: 1 },
      };
      const report = manager.formatReport(result);
      expect(report).not.toContain('= X');
      expect(report).toContain('+ Y');
    });

    it('shows unchanged when option is set', () => {
      const result: EnvDiffResult = {
        beforeLabel: 'a',
        afterLabel: 'b',
        entries: [
          { key: 'X', kind: 'unchanged', oldValue: '1', newValue: '1' },
        ],
        summary: { added: 0, removed: 0, changed: 0, unchanged: 1 },
      };
      const report = manager.formatReport(result, { showUnchanged: true });
      expect(report).toContain('= X');
    });

    it('truncates long values', () => {
      const longVal = 'a'.repeat(100);
      const result: EnvDiffResult = {
        beforeLabel: 'a',
        afterLabel: 'b',
        entries: [{ key: 'K', kind: 'added', newValue: longVal }],
        summary: { added: 1, removed: 0, changed: 0, unchanged: 0 },
      };
      const report = manager.formatReport(result, { maxValueLength: 20 });
      expect(report).toContain('…');
    });
  });

  // ── serialize / deserialize ─────────────────────────────────────────────────

  describe('serialize / deserialize', () => {
    it('round-trips a snapshot', () => {
      const original = manager.capture({ A: '1', B: '2' }, { label: 'round-trip' });
      const json = manager.serialize(original);
      const restored = manager.deserialize(json);

      expect(restored).toEqual(original);
    });

    it('throws on invalid JSON', () => {
      expect(() => manager.deserialize('not-json')).toThrow();
    });

    it('throws on valid JSON missing fields', () => {
      expect(() => manager.deserialize('{"foo":1}')).toThrow(TypeError);
    });
  });
});
