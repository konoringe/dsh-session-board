/**
 * dsh-session-board — React half (client bundle source).
 *
 * Written without JSX (React.createElement) and with a single React import so
 * scripts/build-client.mjs can wrap this file verbatim into the dsh client
 * module format:
 *
 *   window.__ModuleLoader__.load({ id, factory: (require) => { ... } })
 *
 * The component is registered into the root-scoped single slot
 * "sidebar.workspaces" — the seat the built-in workspace browser fills.
 * Replacing single-slot registrants is an officially supported deployment
 * move (the sidebar docs describe exactly this for the brand mark), and a
 * bounded retry keeps the takeover stable regardless of bundle load order.
 */
import * as React from 'react';
import {
  STATUS_ORDER,
  STATUS_COLORS,
  createMetaStore,
  createBoardViewStore,
  isFolderOpen,
  isWorkspaceOpen,
  deriveBoard,
  rowMatchesQuery,
} from './core.js';

const h = React.createElement;
const NS = 'sessionBoard';
const PLUGIN_ID = 'dsh-session-board';
const TAKEOVER_SLOT = 'sidebar.workspaces';
const VERSION = '0.1.0';

/* ------------------------------------------------------------------ */
/* i18n (typed-namespace dictionary pair, zh is the key-set truth)      */
/* ------------------------------------------------------------------ */

const zh = {
  'board.aria': '会话看板',
  'search.placeholder': '搜索会话…',
  'search.clear': '清除搜索',
  'status.planned': '计划中',
  'status.in_progress': '未完成',
  'status.done': '已完成',
  'status.archived': '已归档',
  'group.ungrouped': '未分组',
  'group.ungrouped.hint': '不归属于任何工作区的会话',
  'uncat.badge': '待归类',
  'folder.empty': '暂无会话 · 可拖入',
  'board.empty': '尚无工作区，新建会话后自动出现。',
  'menu.categorize': '归类到',
  'menu.note': '📝 编辑备注',
  'menu.open': '↗ 在主区打开',
  'modal.note.title': '编辑备注',
  'modal.note.placeholder': '例如：等待用户确认方案后再继续…',
  'modal.cancel': '取消',
  'modal.save': '保存',
  'toast.moved': '已将「{title}」归类到 {status}',
  'toast.note': '备注已保存',
  'toast.crossWorkspace': '会话归属其工作目录，不能跨项目移动',
  'takeover.failed': 'sidebar.workspaces 接管未生效，本次会话沿用内置会话列表。',
  'foot.enabled': `session-board v${VERSION} · 已启用`,
};

const en = {
  'board.aria': 'Session board',
  'search.placeholder': 'Search sessions…',
  'search.clear': 'Clear search',
  'status.planned': 'Planned',
  'status.in_progress': 'In progress',
  'status.done': 'Done',
  'status.archived': 'Archived',
  'group.ungrouped': 'Ungrouped',
  'group.ungrouped.hint': 'Sessions that belong to no workspace',
  'uncat.badge': 'Uncategorized',
  'folder.empty': 'No sessions · drop here',
  'board.empty': 'No workspaces yet — they appear once you create a session.',
  'menu.categorize': 'Move to',
  'menu.note': '📝 Edit note',
  'menu.open': '↗ Open in main area',
  'modal.note.title': 'Edit note',
  'modal.note.placeholder': 'e.g. Waiting for the user to confirm the plan…',
  'modal.cancel': 'Cancel',
  'modal.save': 'Save',
  'toast.moved': 'Moved "{title}" to {status}',
  'toast.note': 'Note saved',
  'toast.crossWorkspace': 'Sessions belong to their workspace and cannot move across projects',
  'takeover.failed': 'sidebar.workspaces takeover did not take effect; keeping the built-in list for this page.',
  'foot.enabled': `session-board v${VERSION} · enabled`,
};

/* ------------------------------------------------------------------ */
/* Styles (hand-scoped classes, token-friendly, no build step)          */
/* ------------------------------------------------------------------ */

const STYLE = `
.dsb-root{--dsb-planned:#5aa2ff;--dsb-progress:#e0a437;--dsb-done:#46c26e;--dsb-archived:#7e8aa0;--dsb-accent:#4d6bfe;
  position:relative;display:flex;flex-direction:column;height:100%;min-height:0;font-size:12.5px;color:inherit;user-select:none}
.dsb-search{margin:10px 10px 4px;display:flex;align-items:center;gap:6px;flex:none;
  background:rgba(127,127,127,.10);border:1px solid rgba(127,127,127,.22);border-radius:8px;padding:5px 9px}
.dsb-search:focus-within{border-color:var(--dsb-accent)}
.dsb-search input{flex:1;min-width:0;background:transparent;border:none;outline:none;color:inherit;font-size:12px}
.dsb-search-clear{flex:none;border:none;background:transparent;color:inherit;opacity:.5;cursor:pointer;font-size:12px;padding:0 2px}
.dsb-search-clear:hover{opacity:1}
.dsb-tree{flex:1;min-height:0;overflow-y:auto;padding:6px 6px 10px}
.dsb-tree::-webkit-scrollbar{width:8px}
.dsb-tree::-webkit-scrollbar-thumb{background:rgba(127,127,127,.35);border-radius:4px}
.dsb-row{display:flex;align-items:center;gap:7px;border-radius:7px;padding:6px 8px;cursor:pointer}
.dsb-row:hover{background:rgba(127,127,127,.12)}
.dsb-chev{font-size:10px;opacity:.55;transition:transform .15s;width:10px;text-align:center;flex:none}
.dsb-ws.open>.dsb-ws-row .dsb-chev{transform:rotate(90deg)}
.dsb-ws-ic{font-size:13px;flex:none}
.dsb-ws-name{font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsb-count{font-size:10.5px;opacity:.75;background:rgba(127,127,127,.14);border-radius:10px;padding:1px 7px;flex:none}
.dsb-folders{margin:2px 0 6px}
.dsb-folder-row{margin-left:14px}
.dsb-dot{width:8px;height:8px;border-radius:50%;flex:none}
.dsb-f-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsb-folder-row.fopen{background:rgba(127,127,127,.06)}
.dsb-folder-row.drop,.dsb-empty.drop{outline:1.5px dashed var(--dsb-accent);outline-offset:-2px;
  background:rgba(77,107,254,.14);color:var(--dsb-accent);opacity:1}
.dsb-ses{margin-left:26px;display:flex;flex-direction:column;gap:1px}
.dsb-ses-row{padding:5px 8px 5px 10px;opacity:.82}
.dsb-ses-row:hover{opacity:1}
.dsb-ses-row.selected{background:rgba(77,107,254,.16);opacity:1}
.dsb-ses-row.uncat{opacity:.5}
.dsb-ses-row.uncat.selected{opacity:.85}
.dsb-ses-ic{font-size:11px;opacity:.8;flex:none}
.dsb-ses-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsb-n-ic{font-size:10px;opacity:.9;flex:none;cursor:help}
.dsb-pill{font-size:9.5px;opacity:.7;border:1px dashed rgba(127,127,127,.8);border-radius:4px;padding:0 4px;flex:none}
.dsb-empty{margin-left:10px;padding:7px 8px;font-size:11px;opacity:.45;text-align:center;cursor:default;
  border:1px dashed rgba(127,127,127,.35);border-radius:7px}
.dsb-foot{flex:none;display:flex;align-items:center;gap:7px;padding:8px 14px;font-size:11px;opacity:.6;
  border-top:1px solid rgba(127,127,127,.15)}
.dsb-dot-live{width:7px;height:7px;border-radius:50%;background:var(--dsb-done);box-shadow:0 0 6px var(--dsb-done);flex:none}
.dsb-hint{margin:14px 12px;padding:12px;font-size:12px;opacity:.5;text-align:center;
  border:1px dashed rgba(127,127,127,.3);border-radius:8px}
.dsb-ctx-backdrop{position:absolute;inset:0;z-index:25;background:transparent}
.dsb-ctx{position:absolute;z-index:30;min-width:200px;padding:5px;border-radius:10px;
  background:#1a2130;color:#d9dfe8;border:1px solid rgba(127,127,127,.25);box-shadow:0 12px 32px rgba(0,0,0,.45)}
.dsb-ctx-title{font-size:11px;opacity:.65;padding:5px 9px 6px;max-width:230px;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;border-bottom:1px solid rgba(127,127,127,.2);margin-bottom:4px}
.dsb-ctx-sec{font-size:10px;opacity:.45;letter-spacing:1px;padding:4px 9px 2px}
.dsb-ctx-item{display:flex;align-items:center;gap:8px;font-size:12.5px;padding:6px 9px;border-radius:6px;cursor:pointer}
.dsb-ctx-item:hover{background:rgba(127,127,127,.15)}
.dsb-ctx-item.on{color:#8fa6ff;font-weight:600}
.dsb-ctx-sep{height:1px;background:rgba(127,127,127,.2);margin:4px 6px}
.dsb-ctx-check{margin-left:auto}
.dsb-overlay{position:absolute;inset:0;z-index:40;background:rgba(0,0,0,.35);
  display:flex;align-items:center;justify-content:center}
.dsb-modal{width:300px;max-width:calc(100% - 24px);padding:14px;border-radius:12px;
  background:#1a2130;color:#d9dfe8;border:1px solid rgba(127,127,127,.25);box-shadow:0 12px 32px rgba(0,0,0,.45)}
.dsb-modal h3{margin:0 0 10px;font-size:13.5px;font-weight:600}
.dsb-modal textarea{display:block;width:100%;box-sizing:border-box;min-height:84px;padding:8px 10px;
  background:rgba(127,127,127,.12);border:1px solid rgba(127,127,127,.25);border-radius:8px;
  color:#d9dfe8;font-size:12.5px;font-family:inherit;resize:vertical;outline:none}
.dsb-modal textarea:focus{border-color:var(--dsb-accent)}
.dsb-modal-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
.dsb-modal-btns button{background:rgba(127,127,127,.15);border:1px solid rgba(127,127,127,.25);
  color:inherit;border-radius:8px;padding:6px 14px;font-size:12.5px;cursor:pointer}
.dsb-modal-btns button.primary{background:var(--dsb-accent);border-color:var(--dsb-accent);color:#fff}
.dsb-toast{position:absolute;bottom:22px;left:50%;transform:translateX(-50%);z-index:50;max-width:calc(100% - 40px);
  background:#1b2230;color:#d9dfe8;border:1px solid rgba(127,127,127,.25);border-radius:20px;padding:8px 18px;
  font-size:12.5px;box-shadow:0 8px 24px rgba(0,0,0,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`;

/** Inject the stylesheet once per document, mirroring the built-in plugin CSS convention. */
function injectStyle() {
  if (typeof document === 'undefined') return;
  const tagId = PLUGIN_ID + '/board.css';
  if (document.querySelector('style[data-plugin-css="' + tagId + '"]') !== null) return;
  const tag = document.createElement('style');
  tag.dataset.plugin = PLUGIN_ID;
  tag.dataset.pluginCss = tagId;
  tag.textContent = STYLE;
  document.head.appendChild(tag);
}

/* ------------------------------------------------------------------ */
/* View pieces                                                         */
/* ------------------------------------------------------------------ */

function FolderDot({ status }) {
  return h('span', { className: 'dsb-dot', style: { background: STATUS_COLORS[status] }, 'aria-hidden': 'true' });
}

function SessionRow({ row, selected, io }) {
  return h(
    'div',
    {
      className: 'dsb-row dsb-ses-row' + (row.uncat ? ' uncat' : '') + (selected ? ' selected' : ''),
      draggable: true,
      title: row.title,
      onClick: () => io.openSession(row.id),
      onContextMenu: (event) => io.onContextMenu(event, row.id),
      onDragStart: (event) => io.onDragStart(event, row.id),
      onDragEnd: io.onDragEnd,
    },
    h('span', { className: 'dsb-ses-ic', 'aria-hidden': 'true' }, '💬'),
    h('span', { className: 'dsb-ses-title' }, row.title),
    row.note ? h('span', { className: 'dsb-n-ic', title: row.note }, '📝') : null,
    row.uncat ? h('span', { className: 'dsb-pill' }, io.t('uncat.badge')) : null,
  );
}

function FolderSection({ group, status, rows, open, view, io }) {
  const dropKey = group.key + '|' + status;
  const droppable = io.dropOwner === null || io.dropOwner === group.key;
  const dropProps = droppable
    ? {
        onDragOver: (event) => io.onDragOver(event, dropKey, group.key),
        onDragLeave: () => io.onDragLeave(dropKey),
        onDrop: (event) => io.onDrop(event, group, status),
      }
    : {};
  return h(
    'div',
    { className: 'dsb-folders' },
    h(
      'div',
      {
        className: 'dsb-row dsb-folder-row' + (open ? ' fopen' : '') + (io.dropKey === dropKey ? ' drop' : ''),
        'data-status': status,
        onClick: () => io.viewApi.toggleFolder(group.key, status),
        ...dropProps,
      },
      h(FolderDot, { status }),
      h('span', { className: 'dsb-f-label' }, io.t('status.' + status)),
      h('span', { className: 'dsb-count' }, String(rows.length)),
    ),
    open
      ? h(
          'div',
          { className: 'dsb-ses', ...dropProps },
          rows.length === 0
            ? h(
                'div',
                {
                  className: 'dsb-empty' + (io.dropKey === dropKey ? ' drop' : ''),
                  ...dropProps,
                },
                io.t('folder.empty'),
              )
            : rows.map((row) =>
                h(SessionRow, {
                  key: row.id,
                  row,
                  selected: io.current === row.id,
                  io,
                }),
              ),
        )
      : null,
  );
}

function WorkspaceGroup({ group, open, currentGroupKey, firstGroupKey, view, io, query }) {
  const rows = query === '' ? group.rows : group.rows.filter((row) => rowMatchesQuery(row, query));
  const buckets = { planned: [], in_progress: [], done: [], archived: [] };
  for (const row of rows) buckets[row.uncat ? 'planned' : row.status].push(row);
  const label = group.workspaceId === null ? io.t('group.ungrouped') : group.label;
  return h(
    'div',
    { className: 'dsb-ws' + (open ? ' open' : '') },
    h(
      'div',
      {
        className: 'dsb-row dsb-ws-row',
        title: group.workspaceId === null ? io.t('group.ungrouped.hint') : group.path,
        onClick: () => io.viewApi.toggleWorkspace(group.key),
      },
      h('span', { className: 'dsb-chev', 'aria-hidden': 'true' }, '▶'),
      h('span', { className: 'dsb-ws-ic', 'aria-hidden': 'true' }, '🗂'),
      h('span', { className: 'dsb-ws-name' }, label),
      h('span', { className: 'dsb-count' }, String(rows.length)),
    ),
    open
      ? STATUS_ORDER.map((status) =>
          h(FolderSection, {
            key: status,
            group,
            status,
            rows: buckets[status],
            open: isFolderOpen(view, group.key, status),
            view,
            io,
          }),
        )
      : null,
  );
}

function ContextMenu({ menu, row, io }) {
  return h('div', {
    className: 'dsb-ctx-backdrop',
    tabIndex: -1,
    autoFocus: true,
    onClick: io.closeMenu,
    onContextMenu: (event) => {
      event.preventDefault();
      io.closeMenu();
    },
    onKeyDown: (event) => {
      if (event.key === 'Escape') io.closeMenu();
    },
    children: h(
      'div',
      {
        className: 'dsb-ctx',
        role: 'menu',
        style: { left: menu.x, top: menu.y },
        onClick: (event) => event.stopPropagation(),
      },
      h('div', { className: 'dsb-ctx-title', title: row.title }, row.title),
      h('div', { className: 'dsb-ctx-sec' }, io.t('menu.categorize')),
      STATUS_ORDER.map((status) =>
        h(
          'div',
          {
            key: status,
            role: 'menuitem',
            className: 'dsb-ctx-item' + (row.status === status ? ' on' : ''),
            onClick: () => io.categorize(row.id, status),
          },
          h(FolderDot, { status }),
          io.t('status.' + status),
          row.status === status ? h('span', { className: 'dsb-ctx-check' }, '✓') : null,
        ),
      ),
      h('div', { className: 'dsb-ctx-sep' }),
      h('div', {
        role: 'menuitem',
        className: 'dsb-ctx-item',
        onClick: () => io.openNote(row.id),
      }, io.t('menu.note')),
      h('div', {
        role: 'menuitem',
        className: 'dsb-ctx-item',
        onClick: () => {
          io.closeMenu();
          io.openSession(row.id);
        },
      }, io.t('menu.open')),
    ),
  });
}

function NoteModal({ target, io }) {
  const inputRef = React.useRef(null);
  const initial = io.metaMap[target] ? io.metaMap[target].note || '' : '';
  return h(
    'div',
    {
      className: 'dsb-overlay',
      onClick: (event) => {
        if (event.target === event.currentTarget) io.closeNote();
      },
      onKeyDown: (event) => {
        if (event.key === 'Escape') io.closeNote();
      },
    },
    h(
      'div',
      { className: 'dsb-modal', role: 'dialog', 'aria-label': io.t('modal.note.title') },
      h('h3', null, io.t('modal.note.title')),
      h('textarea', {
        ref: inputRef,
        autoFocus: true,
        defaultValue: initial,
        placeholder: io.t('modal.note.placeholder'),
        rows: 4,
      }),
      h(
        'div',
        { className: 'dsb-modal-btns' },
        h('button', { type: 'button', onClick: io.closeNote }, io.t('modal.cancel')),
        h(
          'button',
          {
            type: 'button',
            className: 'primary',
            onClick: () => io.saveNote(target, inputRef.current ? inputRef.current.value : ''),
          },
          io.t('modal.save'),
        ),
      ),
    ),
  );
}

/* ------------------------------------------------------------------ */
/* The board                                                           */
/* ------------------------------------------------------------------ */

const MENU_W = 216;
const MENU_H = 250;

/**
 * The session board tree: workspace → four fixed status folders → sessions.
 * All business data arrives through framework-derived props (hooks bindings
 * + injected callbacks); the component never touches the plugin context.
 */
export function SessionBoard(props) {
  const { t, openSession, actions, viewApi, useSessions, useWorkspaces, useMeta, useView, wide } = props;
  const sessions = useSessions((snapshot) => snapshot);
  const workspaces = useWorkspaces((snapshot) => snapshot);
  const meta = useMeta((snapshot) => snapshot);
  const view = useView((snapshot) => snapshot);

  const rootRef = React.useRef(null);
  const dragIdRef = React.useRef(null);
  const toastTimerRef = React.useRef(undefined);

  const [query, setQuery] = React.useState('');
  const [menu, setMenu] = React.useState(undefined); // { sessionId, x, y }
  const [noteTarget, setNoteTarget] = React.useState(undefined); // sessionId
  const [toast, setToast] = React.useState(undefined); // { id, msg }
  const [dropKey, setDropKey] = React.useState(undefined);

  React.useEffect(() => () => {
    if (toastTimerRef.current !== undefined) window.clearTimeout(toastTimerRef.current);
  }, []);

  const board = React.useMemo(
    () => deriveBoard({ workspaces, sessions, meta }),
    [workspaces, sessions, meta],
  );

  const rowById = React.useMemo(() => {
    const map = new Map();
    for (const group of board.groups) for (const row of group.rows) map.set(row.id, row);
    return map;
  }, [board]);

  /** sessionId → owning group key (workspaceId, or '' for the ungrouped bucket). */
  const ownerBySession = React.useMemo(() => {
    const map = new Map();
    for (const group of board.groups) for (const row of group.rows) map.set(row.id, group.key);
    return map;
  }, [board]);

  const metaMap = meta.sessions;

  const showToast = React.useCallback((msg) => {
    setToast({ id: Date.now(), msg });
    if (toastTimerRef.current !== undefined) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(undefined), 2200);
  }, []);

  const io = {
    t,
    current: sessions.current,
    metaMap,
    viewApi,
    dropKey,
    dropOwner: dragIdRef.current === null ? null : ownerBySession.get(dragIdRef.current) ?? null,
    openSession,
    onContextMenu: (event, sessionId) => openMenu(event, sessionId),
    closeMenu: () => setMenu(undefined),
    closeNote: () => setNoteTarget(undefined),
    categorize: (sessionId, status) => {
      setMenu(undefined);
      const row = rowById.get(sessionId);
      if (row && row.status !== status) {
        actions.categorize(sessionId, status);
        showToast(t('toast.moved', { title: row.title, status: t('status.' + status) }));
      }
    },
    openNote: (sessionId) => {
      setMenu(undefined);
      setNoteTarget(sessionId);
    },
    saveNote: (sessionId, value) => {
      actions.setNote(sessionId, value);
      setNoteTarget(undefined);
      showToast(t('toast.note'));
    },
    showToast,
    onDragStart: (event, sessionId) => {
      dragIdRef.current = sessionId;
      if (event.dataTransfer) {
        event.dataTransfer.setData('text/plain', sessionId);
        try { event.dataTransfer.setData('application/x-dsh-session-board', sessionId); } catch {}
        event.dataTransfer.effectAllowed = 'move';
      }
    },
    onDragEnd: () => {
      dragIdRef.current = null;
      setDropKey(undefined);
    },
    onDragOver: (event, key, groupKey) => {
      const id = dragIdRef.current;
      if (!id) return;
      if ((ownerBySession.get(id) ?? null) !== groupKey) return; // sessions belong to their workspace
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      setDropKey(key);
    },
    onDragLeave: (key) => {
      setDropKey((current) => (current === key ? undefined : current));
    },
    onDrop: (event, group, status) => {
      event.preventDefault();
      const key = group.key + '|' + status;
      setDropKey(undefined);
      const id = dragIdRef.current || (event.dataTransfer ? event.dataTransfer.getData('text/plain') : '');
      dragIdRef.current = null;
      if (!id) return;
      if ((ownerBySession.get(id) ?? null) !== group.key) {
        showToast(t('toast.crossWorkspace'));
        return;
      }
      io.categorize(id, status);
    },
  };

  const openMenu = (event, sessionId) => {
    event.preventDefault();
    const rootRect = rootRef.current ? rootRef.current.getBoundingClientRect() : { left: 0, top: 0, width: 300, height: 600 };
    const x = Math.min(event.clientX - rootRect.left, Math.max(8, rootRect.width - MENU_W - 8));
    const y = Math.min(event.clientY - rootRect.top, Math.max(8, rootRect.height - MENU_H - 8));
    setMenu({ sessionId, x, y });
  };

  const currentGroupKey = sessions.current !== undefined ? ownerBySession.get(sessions.current) : undefined;
  const firstGroupKey = board.groups.length > 0 ? board.groups[0].key : undefined;

  return h(
    'div',
    { className: 'dsb-root', 'data-dsb-root': 'true', 'aria-label': t('board.aria'), ref: rootRef },
    h(
      'div',
      { className: 'dsb-search' },
      h('input', {
        type: 'search',
        value: query,
        placeholder: t('search.placeholder'),
        'aria-label': t('search.placeholder'),
        onChange: (event) => setQuery(event.target.value),
      }),
      query !== ''
        ? h('button', {
            type: 'button',
            className: 'dsb-search-clear',
            title: t('search.clear'),
            'aria-label': t('search.clear'),
            onClick: () => setQuery(''),
          }, '✕')
        : null,
    ),
    h(
      'div',
      { className: 'dsb-tree' },
      board.groups.length === 0
        ? h('div', { className: 'dsb-hint' }, t('board.empty'))
        : board.groups.map((group) =>
            h(WorkspaceGroup, {
              key: group.key,
              group,
              open: isWorkspaceOpen(view, group.key, {
                currentGroupKey,
                firstGroupKey,
              }),
              view,
              io,
              query,
            }),
          ),
    ),
    h('div', { className: 'dsb-foot' }, h('span', { className: 'dsb-dot-live', 'aria-hidden': 'true' }), t('foot.enabled')),
    menu && rowById.get(menu.sessionId)
      ? h(ContextMenu, {
          key: menu.sessionId + ':' + menu.x + ':' + menu.y,
          menu,
          row: rowById.get(menu.sessionId),
          io,
        })
      : null,
    noteTarget
      ? h(NoteModal, { target: noteTarget, io })
      : null,
    toast ? h('div', { key: toast.id, className: 'dsb-toast', role: 'status' }, toast.msg) : null,
  );
}

/* ------------------------------------------------------------------ */
/* Plugin apply (client half)                                          */
/* ------------------------------------------------------------------ */

/** Services the board needs from the client root context. */
export const inject = ['slots', 'locale', 'sessions', 'workspaces', 'uiWorkspace', 'layout'];

export function apply(ctx) {
  let sessions;
  let workspaces;
  try {
    sessions = ctx.get('sessions');
    workspaces = ctx.get('workspaces');
  } catch (error) {
    console.warn('[session-board] session services unavailable, board not mounted:', error);
    return;
  }
  if (!sessions?.list || !workspaces?.list || !ctx.slots) {
    console.warn('[session-board] required services missing, board not mounted');
    return;
  }
  let uiWorkspace;
  try {
    uiWorkspace = ctx.get('uiWorkspace');
  } catch {
    uiWorkspace = undefined;
  }

  injectStyle();
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-board: dictionaries');

  const meta = createMetaStore();
  const view = createBoardViewStore();

  /** Native session jump: prefer the built-in navigation service, fall back to the controller. */
  const openSession = (sessionId) => {
    try {
      if (uiWorkspace && typeof uiWorkspace.openSession === 'function') {
        uiWorkspace.openSession(sessionId);
        return;
      }
      sessions.open(sessionId);
      try {
        ctx.get('layout')?.selectPanel?.(null);
      } catch {}
    } catch (error) {
      console.warn('[session-board] opening session failed:', error);
    }
  };

  const boardInject = () => ({
    openSession,
    actions: {
      categorize: (sessionId, status) => meta.categorize(sessionId, status),
      setNote: (sessionId, note) => meta.setNote(sessionId, note),
    },
    // The hooks seat hands components the store's STATE snapshot (pure data);
    // the mutating methods must travel as plain inject props — calling
    // methods on the snapshot would be calling undefined.
    viewApi: {
      toggleWorkspace: (groupKey) => view.toggleWorkspace(groupKey),
      toggleFolder: (groupKey, status) => view.toggleFolder(groupKey, status),
    },
    hooks: {
      sessions: sessions.list,
      workspaces: workspaces.list,
      meta,
      view,
    },
  });

  let registered = false;
  const register = () => {
    if (registered) return true;
    try {
      ctx.slots.inject(
        TAKEOVER_SLOT,
        () => ctx.slots.register(
          // Shadowing rank: single-slot cells render their LOWEST-priority live
          // entry, and the built-in browser registers at the default 0 — so -1
          // takes the seat regardless of which bundle registers first.
          // (A second registration at the same priority throws; that is why
          // this must not stay at the default.)
          { name: TAKEOVER_SLOT, priority: -1, locale: NS, inject: boardInject },
          SessionBoard,
        ),
      );
      registered = true;
      return true;
    } catch (error) {
      console.warn('[session-board] registering into ' + TAKEOVER_SLOT + ' failed:', error);
      return false;
    }
  };

  register();

  /**
   * Takeover insurance. Client bundle load order between independent plugins
   * is not contracted, and single-slot seats keep one active registrant.
   * While the board is not visibly mounted, re-register on a short interval;
   * once our root element exists (or after a bounded window), stop.
   */
  ctx.effect(
    () => {
      const started = Date.now();
      const timer = setInterval(() => {
        const mounted = registered || (typeof document !== 'undefined' && document.querySelector('[data-dsb-root]') !== null);
        if (mounted || Date.now() - started > 8000) {
          clearInterval(timer);
          if (!mounted) console.warn('[session-board] ' + t0('takeover.failed'));
          return;
        }
        register();
      }, 500);
      return () => clearInterval(timer);
    },
    'session-board: takeover insurance',
  );
}

/** Dictionary lookup before the locale seat exists (warning path only). */
function t0(key) {
  return (zh && zh[key]) || key;
}