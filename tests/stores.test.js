import { describe, expect, it } from 'vitest';
import { createBoardViewStore, createMetaStore, toRow } from '../src/client/core.js';

function makeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    map,
  };
}

/** Let the store's coalesced microtask flush (notification + persist) run. */
const flush = () => new Promise((resolve) => queueMicrotask(() => queueMicrotask(resolve)));

describe('meta store', () => {
  it('categorizes a session and timestamps the change', async () => {
    const storage = makeStorage();
    const store = createMetaStore({ storage });
    const before = Date.now();
    store.categorize('a', 'in_progress');
    const entry = store.get('a');
    expect(entry.status).toBe('in_progress');
    expect(entry.updatedAt).toBeGreaterThanOrEqual(before);
    await flush();
    expect(JSON.parse(storage.getItem('dsh.session-board.meta.v1')).sessions.a.status).toBe('in_progress');
  });

  it('re-hydrates persisted state into a new store instance', async () => {
    const storage = makeStorage();
    const first = createMetaStore({ storage });
    first.categorize('a', 'done');
    first.setNote('a', 'shipped');
    await flush();
    const second = createMetaStore({ storage });
    expect(second.get('a')).toMatchObject({ status: 'done', note: 'shipped' });
  });

  it('rejects unknown statuses', () => {
    const store = createMetaStore({ storage: makeStorage() });
    expect(() => store.categorize('a', 'someday')).toThrow();
  });

  it('keeps note-only sessions uncategorized (待归类 stays)', async () => {
    const store = createMetaStore({ storage: makeStorage() });
    store.setNote('b', 'waiting for review');
    const entry = store.get('b');
    expect(entry.status).toBeNull();
    expect(entry.note).toBe('waiting for review');
    const row = toRow({ id: 'b', displayTitle: 'B', updatedAt: 1 }, entry);
    expect(row.uncat).toBe(true);
  });

  it('does not demote an explicit status when saving a note', () => {
    const store = createMetaStore({ storage: makeStorage() });
    store.categorize('c', 'done');
    store.setNote('c', 'verified');
    expect(store.get('c')).toMatchObject({ status: 'done', note: 'verified' });
  });

  it('drops the entry entirely when a note is cleared on an uncategorized session', async () => {
    const storage = makeStorage();
    const store = createMetaStore({ storage });
    store.setNote('d', 'temp');
    store.setNote('d', '');
    expect(store.get('d')).toBeUndefined();
    await flush();
    const parsed = JSON.parse(storage.getItem('dsh.session-board.meta.v1'));
    expect(parsed.version).toBe(1);
    expect(parsed.sessions.d).toBeUndefined();
  });

  it('recovers from corrupted storage and sanitizes unknown statuses', () => {
    const storage = makeStorage();
    storage.setItem('dsh.session-board.meta.v1', '{not json');
    expect(createMetaStore({ storage }).getSnapshot().sessions).toEqual({});
    storage.setItem(
      'dsh.session-board.meta.v1',
      JSON.stringify({ version: 1, sessions: { x: { status: 'bogus', updatedAt: 5 }, y: 'junk' } }),
    );
    const store = createMetaStore({ storage });
    // "bogus" status sanitizes to null and the entry holds nothing else — dropped.
    expect(store.get('x')).toBeUndefined();
    expect(store.get('y')).toBeUndefined();
  });
});

describe('view store', () => {
  it('toggles workspaces and folders and persists the overrides', async () => {
    const storage = makeStorage();
    const store = createBoardViewStore({ storage });
    store.toggleWorkspace('ws1');
    store.toggleFolder('ws1', 'done');
    store.toggleFolder('ws1', 'done');
    await flush();
    const snapshot = store.getSnapshot();
    expect(snapshot.workspaces.ws1).toBe(true);
    expect(snapshot.folders['ws1|done']).toBe(false);
    const second = createBoardViewStore({ storage });
    expect(second.getSnapshot().workspaces.ws1).toBe(true);
  });

  it('survives corrupted storage', () => {
    const storage = makeStorage();
    storage.setItem('dsh.session-board.view.v1', ']not json[');
    const store = createBoardViewStore({ storage });
    expect(store.getSnapshot()).toEqual({ workspaces: {}, folders: {}, names: {} });
  });
});
describe('folder name customization', () => {
  it('sets, trims, and persists custom names; toggle preserves them', async () => {
    const storage = makeStorage();
    const store = createBoardViewStore({ storage });
    store.setFolderName('planned', '  backlog  ');
    store.toggleWorkspace('ws1');
    await flush();
    const snapshot = store.getSnapshot();
    expect(snapshot.names.planned).toBe('backlog');
    expect(snapshot.workspaces.ws1).toBe(true);
    const second = createBoardViewStore({ storage });
    expect(second.getSnapshot().names.planned).toBe('backlog');
  });

  it('caps names at 24 characters', () => {
    const store = createBoardViewStore({ storage: makeStorage() });
    store.setFolderName('done', 'x'.repeat(40));
    expect(store.getSnapshot().names.done).toBe('x'.repeat(24));
  });

  it('clearing a name removes it, restoring the default', async () => {
    const storage = makeStorage();
    const store = createBoardViewStore({ storage });
    store.setFolderName('done', 'shipped');
    store.setFolderName('done', '   ');
    expect(store.getSnapshot().names.done).toBeUndefined();
    await flush();
    const parsed = JSON.parse(storage.getItem('dsh.session-board.view.v1'));
    expect(parsed.names.done).toBeUndefined();
    expect(parsed.names).toEqual({});
  });

  it('rejects unknown statuses', () => {
    const store = createBoardViewStore({ storage: makeStorage() });
    expect(() => store.setFolderName('someday', 'x')).toThrow();
  });

  it('sanitizes persisted names (valid key set, strings, 24-char cap)', () => {
    const storage = makeStorage();
    storage.setItem(
      'dsh.session-board.view.v1',
      JSON.stringify({ workspaces: {}, folders: {}, names: { planned: '  ok  ', done: 42, in_progress: '   ', archived: 'y'.repeat(30), bogus: 'z' } }),
    );
    const names = createBoardViewStore({ storage }).getSnapshot().names;
    expect(names.planned).toBe('ok');
    expect(names.done).toBeUndefined();
    expect(names.in_progress).toBeUndefined();
    expect(names.archived).toBe('y'.repeat(24));
    expect(names.bogus).toBeUndefined();
  });
});
