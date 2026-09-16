import { describe, expect, it } from 'vitest';
import {
  byRecency,
  deriveBoard,
  isFolderOpen,
  isWorkspaceOpen,
  owningWorkspaceId,
  pathBasename,
  rowMatchesQuery,
  sessionVisible,
  toRow,
  workspaceLabel,
} from '../src/client/core.js';

const workspaces = {
  items: [
    {
      workspaceId: 'ws1',
      path: 'C:\\demo\\alpha',
      title: null,
      sessionIds: ['s1', 's2', 's3', 's4', 's5'],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
  archivedSessionIds: ['s6'],
  state: 'idle',
  phase: 'ready',
  error: null,
};

const sessions = {
  ids: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10'],
  current: 's9',
  byId: {
    s1: { id: 's1', displayTitle: 'S1', updatedAt: 100 },
    s2: { id: 's2', displayTitle: 'S2', updatedAt: 200 },
    s3: { id: 's3', displayTitle: 'S3', updatedAt: 300 },
    s4: { id: 's4', displayTitle: 'S4', updatedAt: 400 },
    s5: { id: 's5', displayTitle: 'S5', updatedAt: 500 },
    s6: { id: 's6', displayTitle: 'S6 archived', updatedAt: 600 },
    s7: { id: 's7', displayTitle: 'S7 subagent', updatedAt: 700, origin: 'subagent' },
    s8: { id: 's8', displayTitle: 'S8 blank', updatedAt: 800, blank: true },
    s9: { id: 's9', displayTitle: 'S9 blank current', updatedAt: 900, blank: true },
    s10: { id: 's10', displayTitle: 'S10 ungrouped', updatedAt: 250 },
  },
};

const meta = {
  version: 1,
  sessions: {
    s1: { status: 'planned', updatedAt: 1 },
    s3: { status: 'in_progress', updatedAt: 2 },
    s4: { status: 'done', updatedAt: 3 },
    s5: { status: 'archived', updatedAt: 4 },
    s9: { status: null, note: 'hold', updatedAt: 5 },
  },
};

describe('path & label helpers', () => {
  it('strips windows and posix directories', () => {
    expect(pathBasename('C:\\demo\\alpha')).toBe('alpha');
    expect(pathBasename('/home/u/beta/')).toBe('beta');
    expect(pathBasename('plain')).toBe('plain');
    expect(pathBasename('')).toBe('');
  });

  it('prefers a renamed workspace title over the directory basename', () => {
    expect(workspaceLabel({ path: 'C:\\demo\\dir', title: 'Renamed' })).toBe('Renamed');
    expect(workspaceLabel({ path: 'C:\\demo\\dir', title: null })).toBe('dir');
    expect(workspaceLabel({ path: '', title: null })).toBe('');
  });
});

describe('session visibility', () => {
  const archived = new Set(['s6']);

  it('hides subagent children', () => {
    expect(sessionVisible(sessions.byId.s7, { current: undefined, archived })).toBe(false);
  });

  it('hides archived sessions even outside the archived set flag', () => {
    expect(sessionVisible(sessions.byId.s6, { current: undefined, archived })).toBe(false);
  });

  it('shows only the current blank session', () => {
    expect(sessionVisible(sessions.byId.s8, { current: 's9', archived })).toBe(false);
    expect(sessionVisible(sessions.byId.s9, { current: 's9', archived })).toBe(true);
  });

  it('shows ordinary sessions', () => {
    expect(sessionVisible(sessions.byId.s1, { current: 's9', archived })).toBe(true);
  });

  it('returns false for missing summaries', () => {
    expect(sessionVisible(undefined, { current: undefined, archived })).toBe(false);
  });
});

describe('workspace ownership', () => {
  it('finds the accounting workspace', () => {
    expect(owningWorkspaceId(workspaces.items, 's3')).toBe('ws1');
  });

  it('returns null for unaccounted sessions', () => {
    expect(owningWorkspaceId(workspaces.items, 's10')).toBeNull();
  });
});

describe('toRow', () => {
  it('marks sessions without meta as uncategorized', () => {
    const row = toRow(sessions.byId.s2, undefined);
    expect(row.uncat).toBe(true);
    expect(row.status).toBeNull();
    expect(row.title).toBe('S2');
  });

  it('keeps note-only entries uncategorized', () => {
    const row = toRow(sessions.byId.s9, meta.sessions.s9);
    expect(row.uncat).toBe(true);
    expect(row.note).toBe('hold');
  });
});

describe('byRecency', () => {
  it('sorts newest first with an id tiebreak', () => {
    const rows = [
      { id: 'b', updatedAt: 10 },
      { id: 'a', updatedAt: 10 },
      { id: 'c', updatedAt: 30 },
    ].sort(byRecency);
    expect(rows.map((row) => row.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('deriveBoard', () => {
  const board = deriveBoard({ workspaces, sessions, meta });

  it('renders one group per workspace plus the ungrouped bucket', () => {
    expect(board.groups).toHaveLength(2);
    expect(board.groups[0].workspaceId).toBe('ws1');
    expect(board.groups[1].workspaceId).toBeNull();
    expect(board.current).toBe('s9');
  });

  it('labels workspace groups by directory basename', () => {
    expect(board.groups[0].label).toBe('alpha');
    expect(board.groups[1].label).toBe('ungrouped');
  });

  it('files uncat sessions into 计划中 and honors explicit statuses', () => {
    const g1 = board.groups[0];
    expect(g1.total).toBe(5);
    expect(g1.buckets.planned.map((row) => row.id)).toEqual(['s2', 's1']);
    expect(g1.buckets.in_progress.map((row) => row.id)).toEqual(['s3']);
    expect(g1.buckets.done.map((row) => row.id)).toEqual(['s4']);
    expect(g1.buckets.archived.map((row) => row.id)).toEqual(['s5']);
  });

  it('excludes archived, subagent, and non-current blank sessions', () => {
    const ids = board.groups.flatMap((group) => group.rows.map((row) => row.id));
    expect(ids).not.toContain('s6');
    expect(ids).not.toContain('s7');
    expect(ids).not.toContain('s8');
  });

  it('collects sessions of no workspace into the ungrouped group', () => {
    const g2 = board.groups[1];
    expect(g2.rows.map((row) => row.id)).toEqual(['s10', 's9']);
    expect(g2.buckets.planned.every((row) => row.uncat)).toBe(true);
  });

  it('is robust against empty snapshots', () => {
    const empty = deriveBoard({ workspaces: undefined, sessions: undefined, meta: { sessions: {} } });
    expect(empty.groups).toEqual([]);
  });
});

describe('query filter', () => {
  it('matches case-insensitively and passes empty queries', () => {
    expect(rowMatchesQuery({ title: 'Hello World' }, 'wor')).toBe(true);
    expect(rowMatchesQuery({ title: 'Hello World' }, 'xyz')).toBe(false);
    expect(rowMatchesQuery({ title: 'Anything' }, '   ')).toBe(true);
  });
});

describe('view state defaults', () => {
  const view = { workspaces: { wsX: true }, folders: { 'ws1|done': true } };

  it('defaults folder openness to 计划中/未完成 open, done/archived closed', () => {
    expect(isFolderOpen({ workspaces: {}, folders: {} }, 'ws1', 'planned')).toBe(true);
    expect(isFolderOpen({ workspaces: {}, folders: {} }, 'ws1', 'in_progress')).toBe(true);
    expect(isFolderOpen({ workspaces: {}, folders: {} }, 'ws1', 'done')).toBe(false);
    expect(isFolderOpen({ workspaces: {}, folders: {} }, 'ws1', 'archived')).toBe(false);
  });

  it('lets explicit overrides win', () => {
    expect(isFolderOpen(view, 'ws1', 'done')).toBe(true);
    expect(isFolderOpen(view, 'ws1', 'planned')).toBe(true);
  });

  it('opens the workspace owning the current session by default', () => {
    expect(isWorkspaceOpen({ workspaces: {}, folders: {} }, 'wsB', {
      currentGroupKey: 'wsB',
      firstGroupKey: 'wsA',
    })).toBe(true);
    expect(isWorkspaceOpen({ workspaces: {}, folders: {} }, 'wsC', {
      currentGroupKey: 'wsB',
      firstGroupKey: 'wsA',
    })).toBe(false);
  });

  it('falls back to the first workspace and honors explicit overrides', () => {
    expect(isWorkspaceOpen({ workspaces: {}, folders: {} }, 'wsA', {
      currentGroupKey: undefined,
      firstGroupKey: 'wsA',
    })).toBe(true);
    expect(isWorkspaceOpen({ workspaces: { wsA: false }, folders: {} }, 'wsA', {
      currentGroupKey: undefined,
      firstGroupKey: 'wsA',
    })).toBe(false);
  });
});
