/**
 * dsh-session-board — framework-free core.
 *
 * Everything in this file is pure JavaScript with zero imports so it can be
 * unit-tested under vitest and concatenated verbatim into the client bundle
 * (scripts/build-client.mjs). The React half lives in board.js.
 *
 * Data model (from the plugin plan):
 *   Status = 'planned' | 'in_progress' | 'done' | 'archived'
 *   MetaEntry = { status: Status | null, note?: string, updatedAt: number }
 *   null status = "never categorized" — the session still renders inside the
 *   计划中 folder with a 待归类 pill (the plan forbids forcing a status).
 */

/** Display order of the four fixed folders: pipeline → archive. */
export const STATUS_ORDER = ['planned', 'in_progress', 'done', 'archived'];

/** Theme-stable folder dot colors (also used by the context menu). */
export const STATUS_COLORS = {
  planned: '#5aa2ff',
  in_progress: '#e0a437',
  done: '#46c26e',
  archived: '#7e8aa0',
};

/** localStorage keys (persisted per webview origin = per dsh profile). */
export const META_STORAGE_KEY = 'dsh.session-board.meta.v1';
export const VIEW_STORAGE_KEY = 'dsh.session-board.view.v1';

const VALID_STATUSES = new Set(STATUS_ORDER);

/* ------------------------------------------------------------------ */
/* Storage backends                                                    */
/* ------------------------------------------------------------------ */

/**
 * Resolve the best available persistence backend. Falls back to an in-memory
 * map (tests, or exotic embedders without localStorage) so the UI keeps
 * working — persistence then merely degrades to per-page lifetime.
 */
function resolveStorage() {
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      // Safari/private mode throws on setItem even when localStorage exists.
      const probe = '__dsh_session_board_probe__';
      globalThis.localStorage.setItem(probe, '1');
      globalThis.localStorage.removeItem(probe);
      return globalThis.localStorage;
    }
  } catch {
    /* fall through to memory */
  }
  const memory = new Map();
  return {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => { memory.set(key, String(value)); },
    removeItem: (key) => { memory.delete(key); },
  };
}

/* ------------------------------------------------------------------ */
/* Snapshot stores                                                     */
/* ------------------------------------------------------------------ */

/**
 * Minimal observable store matching the dsh client source shape
 * ({ getSnapshot(): stable snapshot, subscribe(listener): unsubscribe }).
 * Components consume it through the slot ledger's hooks binding, which wraps
 * it into a useSyncExternalStoreWithSelector hook.
 */
function createStore(initial, persist) {
  let state = initial;
  const listeners = new Set();
  let flushQueued = false;
  const flush = () => {
    flushQueued = false;
    persist?.(state);
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Replace the snapshot immutably, then notify + persist (coalesced per microtask). */
    set(next) {
      if (next === state) return;
      state = next;
      if (!flushQueued) {
        // Coalesce bursty updates (drag & drop, rapid menu clicks) into one
        // write and one notification pass per microtask.
        flushQueued = true;
        queueMicrotask(flush);
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* Session metadata store (status + note)                              */
/* ------------------------------------------------------------------ */

function sanitizeState(raw) {
  const state = { version: 1, sessions: {} };
  if (raw === null || typeof raw !== 'object') return state;
  if (raw.version !== 1 || typeof raw.sessions !== 'object' || raw.sessions === null) return state;
  for (const [sessionId, entry] of Object.entries(raw.sessions)) {
    if (typeof sessionId !== 'string' || sessionId === '' || entry === null || typeof entry !== 'object') continue;
    const status = entry.status === null || entry.status === undefined
      ? null
      : (VALID_STATUSES.has(entry.status) ? entry.status : null);
    const note = typeof entry.note === 'string' && entry.note !== '' ? entry.note : undefined;
    const updatedAt = typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt) ? entry.updatedAt : 0;
    if (status === null && note === undefined) continue; // nothing worth remembering
    state.sessions[sessionId] = note === undefined ? { status, updatedAt } : { status, note, updatedAt };
  }
  return state;
}

/**
 * Create the session metadata store: one entry per categorized or annotated
 * session, persisted to localStorage under META_STORAGE_KEY.
 * @param options.storage - persistence backend override (tests).
 */
export function createMetaStore(options = {}) {
  const storage = options.storage ?? resolveStorage();
  let parsed = null;
  try {
    parsed = sanitizeState(JSON.parse(storage.getItem(META_STORAGE_KEY) ?? 'null'));
  } catch {
    parsed = sanitizeState(null);
  }
  const store = createStore(parsed, (state) => {
    try {
      storage.setItem(META_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('[session-board] persisting meta failed:', error);
    }
  });

  const touch = (sessionId, patch) => {
    const current = store.getSnapshot();
    const previous = current.sessions[sessionId];
    const status = patch.status !== undefined ? patch.status : (previous?.status ?? null);
    // patch.note uses a null sentinel for "clear"; undefined keeps the previous note.
    const note = patch.note !== undefined ? patch.note : previous?.note;
    const hasNote = typeof note === 'string' && note !== '';
    const nextSessions = { ...current.sessions };
    if (status === null && !hasNote) {
      // Nothing worth remembering (e.g. a cleared note on an uncategorized
      // session) — drop the entry entirely.
      delete nextSessions[sessionId];
    } else {
      nextSessions[sessionId] = { status, ...(hasNote ? { note } : {}), updatedAt: Date.now() };
    }
    store.set({ version: 1, sessions: nextSessions });
  };

  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    /** Read one entry (or undefined when the session was never touched). */
    get: (sessionId) => store.getSnapshot().sessions[sessionId],
    /**
     * File a session into one of the four folders. Records the wall-clock time
     * of the change (the plan requires status changes to timestamp themselves).
     */
    categorize: (sessionId, status) => {
      if (!VALID_STATUSES.has(status)) throw new Error(`session-board: unknown status "${status}"`);
      touch(sessionId, { status });
    },
    /**
     * Save (or clear, with an empty string) a note. Editing the note of a
     * never-categorized session keeps status null — it stays 待归类.
     */
    setNote: (sessionId, note) => {
      const trimmed = typeof note === 'string' ? note.trim() : '';
      touch(sessionId, { note: trimmed === '' ? null : trimmed });
    },
  };
}

/* ------------------------------------------------------------------ */
/* View store (expand/collapse, persisted)                             */
/* ------------------------------------------------------------------ */

function sanitizeView(raw) {
  const pick = (value) => {
    if (value === null || typeof value !== 'object') return {};
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof key === 'string' && typeof entry === 'boolean') out[key] = entry;
    }
    return out;
  };
  return {
    workspaces: pick(raw?.workspaces),
    folders: pick(raw?.folders),
  };
}

/**
 * Create the view store: explicit expand/collapse overrides only. Defaults
 * are derived at render time (folders 计划中/未完成 start open like the
 * concept mockup; the workspace owning the current session starts open).
 */
export function createBoardViewStore(options = {}) {
  const storage = options.storage ?? resolveStorage();
  let parsed;
  try {
    parsed = sanitizeView(JSON.parse(storage.getItem(VIEW_STORAGE_KEY) ?? 'null'));
  } catch {
    parsed = sanitizeView(null);
  }
  const store = createStore(parsed, (state) => {
    try {
      storage.setItem(VIEW_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('[session-board] persisting view state failed:', error);
    }
  });
  const flip = (mapKey, key) => {
    const current = store.getSnapshot();
    store.set({
      workspaces: mapKey === 'workspaces' ? { ...current.workspaces, [key]: !(current.workspaces[key] ?? false) } : current.workspaces,
      folders: mapKey === 'folders' ? { ...current.folders, [key]: !(current.folders[key] ?? false) } : current.folders,
    });
  };
  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    toggleWorkspace: (workspaceId) => flip('workspaces', workspaceId),
    toggleFolder: (workspaceId, status) => flip('folders', `${workspaceId}|${status}`),
  };
}

/** Effective open state for a workspace row. */
export function isWorkspaceOpen(view, groupKey, { currentGroupKey, firstGroupKey }) {
  const explicit = view.workspaces[groupKey];
  if (explicit !== undefined) return explicit;
  if (currentGroupKey !== undefined) return groupKey === currentGroupKey;
  return groupKey === firstGroupKey;
}

/** Effective open state for a folder row (计划中/未完成 default open). */
export function isFolderOpen(view, workspaceId, status) {
  const explicit = view.folders[`${workspaceId}|${status}`];
  if (explicit !== undefined) return explicit;
  return status === 'planned' || status === 'in_progress';
}

/* ------------------------------------------------------------------ */
/* Derivation: (workspaces, sessions, meta) → board tree               */
/* ------------------------------------------------------------------ */

/** Directory label: basename of a path, both separators accepted. */
export function pathBasename(path) {
  if (typeof path !== 'string' || path === '') return '';
  const normalized = path.replace(/[\\/]+$/, '');
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  return index === -1 ? normalized : normalized.slice(index + 1);
}

/** Workspace display label: renamed title first, directory basename second. */
export function workspaceLabel(workspace) {
  const title = typeof workspace?.title === 'string' && workspace.title !== '' ? workspace.title : undefined;
  const base = pathBasename(workspace?.path ?? '');
  return title ?? (base || workspace?.path || '');
}

/** Recency comparator: newest first, id as deterministic tiebreak. */
export function byRecency(left, right) {
  if (right.updatedAt !== left.updatedAt) return right.updatedAt - left.updatedAt;
  return left.id < right.id ? -1 : 1;
}

/**
 * Visibility policy mirrored from the built-in workspace browser: ordinary
 * sessions are visible; among blank sessions only the current one is visible
 * (it is the provisional "New Session" row); subagent children and archived
 * sessions are visible nowhere.
 */
export function sessionVisible(summary, { current, archived }) {
  if (summary === undefined) return false;
  if (summary.origin === 'subagent') return false;
  if (archived.has(summary.id)) return false;
  if (summary.blank && summary.id !== current) return false;
  return true;
}

/** The workspace whose sessionIds account for the session, or null (未分组). */
export function owningWorkspaceId(workspaces, sessionId) {
  for (const workspace of workspaces) {
    if (Array.isArray(workspace.sessionIds) && workspace.sessionIds.includes(sessionId)) return workspace.workspaceId;
  }
  return null;
}

/**
 * Project one session summary + meta into a board row.
 * status stays null for never-categorized sessions (they render under 计划中
 * with the 待归类 pill).
 */
export function toRow(summary, metaEntry) {
  return {
    id: summary.id,
    title: summary.displayTitle ?? summary.title ?? summary.id,
    status: metaEntry ? metaEntry.status : null,
    note: metaEntry?.note,
    updatedAt: metaEntry?.updatedAt ?? summary.updatedAt,
    uncat: !metaEntry || metaEntry.status === null,
  };
}

/**
 * Derive the whole board model.
 * @param input.workspaces - workspaces.list snapshot (items in host order).
 * @param input.sessions - sessions.list snapshot ({ ids, byId, current }).
 * @param input.meta - meta store snapshot ({ sessions: Record<id, entry> }).
 * @returns groups in render order, each with its four folder buckets.
 */
export function deriveBoard({ workspaces, sessions, meta }) {
  const items = Array.isArray(workspaces?.items) ? workspaces.items : [];
  const byId = sessions?.byId ?? {};
  const current = sessions?.current;
  const archived = new Set(workspaces?.archivedSessionIds ?? []);
  const visible = (id) => sessionVisible(byId[id], { current, archived });

  const buildGroup = (key, workspaceId, workspace) => {
    const source = workspaceId === null
      ? Object.keys(byId).filter((id) => visible(id) && owningWorkspaceId(items, id) === null)
      : (items.find((workspace) => workspace.workspaceId === workspaceId)?.sessionIds ?? []).filter(visible);
    const rows = source
      .map((id) => toRow(byId[id], meta.sessions[id]))
      .sort(byRecency);
    const buckets = { planned: [], in_progress: [], done: [], archived: [] };
    for (const row of rows) buckets[row.uncat ? 'planned' : row.status].push(row);
    return {
      key,
      workspaceId,
      path: workspaceId === null ? '' : (workspace?.path ?? ''),
      label: workspaceId === null ? '' : workspaceLabel(workspace),
      rows,
      buckets,
      total: rows.length,
    };
  };

  const groups = items.map((workspace) => buildGroup(workspace.workspaceId, workspace.workspaceId, workspace));
  const ungroupedRows = Object.keys(byId).filter((id) => visible(id) && owningWorkspaceId(items, id) === null);
  if (ungroupedRows.length > 0) {
    const group = buildGroup('', null, null);
    group.label = 'ungrouped';
    groups.push(group);
  }
  return { groups, current };
}

/** Case-insensitive substring filter over a row's title. */
export function rowMatchesQuery(row, query) {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return row.title.toLowerCase().includes(q);
}