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
  'menu.rename': '📝 重命名',
  'menu.resetName': '↺ 恢复默认名称',
  'modal.rename.title': '自定义文件夹名称',
  'modal.rename.placeholder': '输入新名称，留空恢复默认',
  'toast.nameSaved': '名称已更新',
  'toast.nameReset': '已恢复默认名称',
  'menu.renameSession': '✏️ 重命名会话',
  'menu.fork': '⑂ 分叉会话',
  'menu.archive': '🗄 归档会话',
  'menu.delete': '🗑 删除对话',
  'modal.renameSession.title': '重命名会话',
  'modal.delete.title': '删除对话',
  'modal.delete.desc': '将删除对话「{title}」及其全部记录，不可恢复。',
  'modal.delete.confirm': '确认删除',
  'toast.renamed': '会话已重命名',
  'toast.renameNotOpen': '请先打开该会话再重命名',
  'toast.renameFailed': '重命名失败：{reason}',
  'toast.forked': '已分叉新会话',
  'toast.archived': '会话已归档',
  'toast.deleted': '对话已删除',
  'toast.actionFailed': '操作失败',
  'toast.reordered': '已更新会话排序（对内置列表的手动排序生效）',
  'toast.reorderUngrouped': '未分组的会话不支持排序',
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
  'menu.rename': '📝 Rename',
  'menu.resetName': '↺ Reset to default name',
  'modal.rename.title': 'Customize folder name',
  'modal.rename.placeholder': 'New name; leave empty to restore the default',
  'toast.nameSaved': 'Name updated',
  'toast.nameReset': 'Default name restored',
  'menu.renameSession': '✏️ Rename session',
  'menu.fork': '⑂ Fork session',
  'menu.archive': '🗄 Archive session',
  'menu.delete': '🗑 Delete conversation',
  'modal.renameSession.title': 'Rename session',
  'modal.delete.title': 'Delete conversation',
  'modal.delete.desc': 'This deletes "{title}" with its entire record. It cannot be undone.',
  'modal.delete.confirm': 'Confirm delete',
  'toast.renamed': 'Session renamed',
  'toast.renameNotOpen': 'Open the session first to rename it',
  'toast.renameFailed': 'Rename failed: {reason}',
  'toast.forked': 'Session forked',
  'toast.archived': 'Session archived',
  'toast.deleted': 'Conversation deleted',
  'toast.actionFailed': 'Action failed',
  'toast.reordered': 'Order updated (applies to the built-in list\'s manual order)',
  'toast.reorderUngrouped': 'Ungrouped sessions cannot be reordered',
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
.dsb-ses-row.dropBefore{box-shadow:inset 0 2px 0 var(--dsb-accent)}
.dsb-ses-row.dropAfter{box-shadow:inset 0 -2px 0 var(--dsb-accent)}
.dsb-ses-ic{font-size:11px;opacity:.8;flex:none}
.dsb-ses-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsb-n-ic{font-size:10px;opacity:.9;flex:none;cursor:help}
.dsb-pill{font-size:9.5px;opacity:.7;border:1px dashed rgba(127,127,127,.8);border-radius:4px;padding:0 4px;flex:none}
.dsb-empty{margin-left:10px;padding:7px 8px;font-size:11px;opacity:.45;text-align:center;cursor:default;
  border:1px dashed rgba(127,127,127,.35);border-radius:7px}
.dsb-hint{margin:14px 12px;padding:12px;font-size:12px;opacity:.5;text-align:center;
  border:1px dashed rgba(127,127,127,.3);border-radius:8px}
.dsb-ctx-backdrop{position:absolute;inset:0;z-index:25;background:transparent}
.dsb-ctx{position:absolute;z-index:30;min-width:200px;padding:5px;border-radius:10px;
  background:var(--dsw-specific-menu,var(--dsw-specific-sidebar-fill,#1a2130));color:var(--dsw-alias-label-primary,#d9dfe8);
  border:1px solid rgba(127,127,127,.25);box-shadow:0 12px 32px rgba(0,0,0,.45)}
.dsb-ctx-title{font-size:11px;opacity:.65;padding:5px 9px 6px;max-width:230px;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;border-bottom:1px solid rgba(127,127,127,.2);margin-bottom:4px}
.dsb-ctx-sec{font-size:10px;opacity:.45;letter-spacing:1px;padding:4px 9px 2px}
.dsb-ctx-item{display:flex;align-items:center;gap:8px;font-size:12.5px;padding:6px 9px;border-radius:6px;cursor:pointer}
.dsb-ctx-item:hover{background:rgba(127,127,127,.15)}
.dsb-ctx-item.on{color:var(--dsw-static-blue-500,var(--dsw-alias-label-primary,#8fa6ff));font-weight:600}
.dsb-ctx-sep{height:1px;background:rgba(127,127,127,.2);margin:4px 6px}
.dsb-ctx-check{margin-left:auto}
.dsb-overlay{position:absolute;inset:0;z-index:40;background:rgba(0,0,0,.35);
  display:flex;align-items:center;justify-content:center}
.dsb-modal{width:300px;max-width:calc(100% - 24px);padding:14px;border-radius:12px;
  background:var(--dsw-specific-menu,var(--dsw-specific-sidebar-fill,#1a2130));color:var(--dsw-alias-label-primary,#d9dfe8);
  border:1px solid rgba(127,127,127,.25);box-shadow:0 12px 32px rgba(0,0,0,.45)}
.dsb-modal h3{margin:0 0 10px;font-size:13.5px;font-weight:600}
.dsb-modal-desc{margin:0 0 4px;font-size:12.5px;line-height:1.6;opacity:.85}
.dsb-modal textarea,.dsb-modal input{display:block;width:100%;box-sizing:border-box;padding:8px 10px;
  background:rgba(127,127,127,.12);border:1px solid rgba(127,127,127,.25);border-radius:8px;
  color:inherit;font-size:12.5px;font-family:inherit;outline:none}
.dsb-modal textarea{min-height:84px;resize:vertical}
.dsb-modal textarea:focus,.dsb-modal input:focus{border-color:var(--dsb-accent)}
.dsb-modal-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
.dsb-modal-btns button{background:rgba(127,127,127,.15);border:1px solid rgba(127,127,127,.25);
  color:inherit;border-radius:8px;padding:6px 14px;font-size:12.5px;cursor:pointer}
.dsb-modal-btns button.primary{background:var(--dsb-accent);border-color:var(--dsb-accent);color:#fff}
.dsb-modal-btns button.danger{background:#c0392b;border-color:#c0392b;color:#fff}
.dsb-toast{position:absolute;bottom:22px;left:50%;transform:translateX(-50%);z-index:50;max-width:calc(100% - 40px);
  background:var(--dsw-specific-menu,var(--dsw-specific-sidebar-fill,#1b2230));color:var(--dsw-alias-label-primary,#d9dfe8);
  border:1px solid rgba(127,127,127,.25);border-radius:20px;padding:8px 18px;
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

function SessionRow({ row, selected, nextId, io }) {
  const rowDropMark = io.rowDrop && io.rowDrop.id === row.id
    ? (io.rowDrop.after ? ' dropAfter' : ' dropBefore')
    : '';
  return h(
    'div',
    {
      className: 'dsb-row dsb-ses-row' + (row.uncat ? ' uncat' : '') + (selected ? ' selected' : '') + rowDropMark,
      draggable: true,
      title: row.title,
      onClick: () => io.openSession(row.id),
      onContextMenu: (event) => io.onContextMenu(event, row.id),
      onDragStart: (event) => io.onDragStart(event, row.id),
      onDragEnd: io.onDragEnd,
      onDragOver: (event) => io.onRowDragOver(event, row.id),
      onDragLeave: () => io.onRowDragLeave(row.id),
      onDrop: (event) => io.onRowDrop(event, row.id, nextId),
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
        onContextMenu: (event) => io.onFolderContextMenu(event, status),
        ...dropProps,
      },
      h(FolderDot, { status }),
      h('span', { className: 'dsb-f-label' }, io.folderLabel(status)),
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
            : rows.map((row, index) =>
                h(SessionRow, {
                  key: row.id,
                  row,
                  nextId: rows[index + 1] ? rows[index + 1].id : undefined,
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
            open: isFolderOpen(view, group.key, status, group.buckets[status].length > 0),
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
          io.folderLabel(status),
          row.status === status ? h('span', { className: 'dsb-ctx-check' }, '✓') : null,
        ),
      ),
      h('div', { className: 'dsb-ctx-sep' }),
      h('div', {
        role: 'menuitem',
        className: 'dsb-ctx-item',
        onClick: () => io.openSessionRename(row.id, row.title),
      }, io.t('menu.renameSession')),
      h('div', {
        role: 'menuitem',
        className: 'dsb-ctx-item',
        onClick: () => io.openNote(row.id),
      }, io.t('menu.note')),
      h('div', { className: 'dsb-ctx-sep' }),
      h('div', {
        role: 'menuitem',
        className: 'dsb-ctx-item',
        onClick: () => io.forkSession(row.id),
      }, io.t('menu.fork')),
      h('div', {
        role: 'menuitem',
        className: 'dsb-ctx-item',
        onClick: () => io.archiveSession(row.id),
      }, io.t('menu.archive')),
      io.deleteAvailable
        ? h('div', {
            role: 'menuitem',
            className: 'dsb-ctx-item',
            onClick: () => io.openDeleteConfirm(row.id, row.title),
          }, io.t('menu.delete'))
        : null,
      h('div', { className: 'dsb-ctx-sep' }),
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

/** Right-click menu for a folder row: rename (and reset when customized). */
function FolderMenu({ menu, io }) {
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
      h('div', { className: 'dsb-ctx-title' }, io.folderLabel(menu.status)),
      h('div', {
        role: 'menuitem',
        className: 'dsb-ctx-item',
        onClick: () => io.openRename(menu.status),
      }, io.t('menu.rename')),
      io.names && io.names[menu.status]
        ? h('div', {
            role: 'menuitem',
            className: 'dsb-ctx-item',
            onClick: () => io.resetName(menu.status),
          }, io.t('menu.resetName'))
        : null,
    ),
  });
}

/** Single-line rename dialog: Enter saves, Escape closes, empty restores default. */
function RenameModal({ status, names, io }) {
  const inputRef = React.useRef(null);
  const initial = names && typeof names[status] === 'string' ? names[status] : '';
  const save = () => io.saveName(status, inputRef.current ? inputRef.current.value : '');
  return h(
    'div',
    {
      className: 'dsb-overlay',
      onClick: (event) => {
        if (event.target === event.currentTarget) io.closeRename();
      },
      onKeyDown: (event) => {
        if (event.key === 'Escape') io.closeRename();
      },
    },
    h(
      'div',
      { className: 'dsb-modal', role: 'dialog', 'aria-label': io.t('modal.rename.title') },
      h('h3', null, io.t('modal.rename.title')),
      h('input', {
        ref: inputRef,
        autoFocus: true,
        defaultValue: initial,
        placeholder: io.t('modal.rename.placeholder'),
        maxLength: 24,
        onKeyDown: (event) => {
          if (event.key === 'Enter') save();
        },
      }),
      h(
        'div',
        { className: 'dsb-modal-btns' },
        h('button', { type: 'button', onClick: io.closeRename }, io.t('modal.cancel')),
        h('button', { type: 'button', className: 'primary', onClick: save }, io.t('modal.save')),
      ),
    ),
  );
}

/** Session rename dialog: prefilled with the current title, Enter saves. */
function SessionRenameModal({ target, io }) {
  const inputRef = React.useRef(null);
  const save = () => io.saveSessionRename(target.sessionId, inputRef.current ? inputRef.current.value : '');
  return h(
    'div',
    {
      className: 'dsb-overlay',
      onClick: (event) => {
        if (event.target === event.currentTarget) io.closeSessionRename();
      },
      onKeyDown: (event) => {
        if (event.key === 'Escape') io.closeSessionRename();
      },
    },
    h(
      'div',
      { className: 'dsb-modal', role: 'dialog', 'aria-label': io.t('modal.renameSession.title') },
      h('h3', null, io.t('modal.renameSession.title')),
      h('input', {
        ref: inputRef,
        autoFocus: true,
        defaultValue: target.title || '',
        placeholder: target.title || '',
        onKeyDown: (event) => {
          if (event.key === 'Enter') save();
        },
      }),
      h(
        'div',
        { className: 'dsb-modal-btns' },
        h('button', { type: 'button', onClick: io.closeSessionRename }, io.t('modal.cancel')),
        h('button', { type: 'button', className: 'primary', onClick: save }, io.t('modal.save')),
      ),
    ),
  );
}

/** Destructive-delete confirmation for the desktop session-manage action. */
function DeleteConfirmModal({ target, io }) {
  return h(
    'div',
    {
      className: 'dsb-overlay',
      onClick: (event) => {
        if (event.target === event.currentTarget) io.closeDeleteConfirm();
      },
      onKeyDown: (event) => {
        if (event.key === 'Escape') io.closeDeleteConfirm();
      },
    },
    h(
      'div',
      { className: 'dsb-modal', role: 'alertdialog', 'aria-label': io.t('modal.delete.title') },
      h('h3', null, io.t('modal.delete.title')),
      h('p', { className: 'dsb-modal-desc' }, io.t('modal.delete.desc', { title: target.title || target.sessionId })),
      h(
        'div',
        { className: 'dsb-modal-btns' },
        h('button', { type: 'button', onClick: io.closeDeleteConfirm }, io.t('modal.cancel')),
        h('button', { type: 'button', className: 'danger', onClick: () => io.confirmDelete(target.sessionId) }, io.t('modal.delete.confirm')),
      ),
    ),
  );
}

/* ------------------------------------------------------------------ */
/* The board                                                           */
/* ------------------------------------------------------------------ */

const MENU_W = 216;
const MENU_H = 380;

/**
 * The session board tree: workspace → four fixed status folders → sessions.
 * All business data arrives through framework-derived props (hooks bindings
 * + injected callbacks); the component never touches the plugin context.
 */
export function SessionBoard(props) {
  const { t, openSession, actions, actions2, viewApi, useSessions, useWorkspaces, useMeta, useView, wide } = props;
  const sessions = useSessions((snapshot) => snapshot);
  const workspaces = useWorkspaces((snapshot) => snapshot);
  const meta = useMeta((snapshot) => snapshot);
  const view = useView((snapshot) => snapshot);

  const rootRef = React.useRef(null);
  const dragIdRef = React.useRef(null);
  const dragAltRef = React.useRef(false); // Alt+drag = reorder within the workspace
  const toastTimerRef = React.useRef(undefined);

  const [query, setQuery] = React.useState('');
  const [menu, setMenu] = React.useState(undefined); // {kind:'session', sessionId, x, y} | {kind:'folder', status, x, y}
  const [noteTarget, setNoteTarget] = React.useState(undefined); // sessionId
  const [renameTarget, setRenameTarget] = React.useState(undefined); // status
  const [sessionRenameTarget, setSessionRenameTarget] = React.useState(undefined); // { sessionId, title }
  const [deleteTarget, setDeleteTarget] = React.useState(undefined); // { sessionId, title }
  const [rowDrop, setRowDrop] = React.useState(undefined); // { id, after } reorder marker
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

  /** Folder display name: user customization first, i18n default second. */
  const folderLabel = (status) => {
    const custom = view.names && typeof view.names[status] === 'string' && view.names[status] !== '' ? view.names[status] : undefined;
    return custom ?? t('status.' + status);
  };

  const deleteAvailable = typeof window !== 'undefined'
    && !!window.__dshSessionManager
    && typeof window.__dshSessionManager.deleteSession === 'function';

  const io = {
    t,
    current: sessions.current,
    metaMap,
    viewApi,
    names: view.names,
    folderLabel,
    deleteAvailable,
    rowDrop,
    altDrag: dragAltRef.current,
    dropKey,
    dropOwner: dragIdRef.current === null ? null : ownerBySession.get(dragIdRef.current) ?? null,
    openSession,
    onContextMenu: (event, sessionId) => openMenu(event, 'session', sessionId),
    onRowDragOver: (event, targetId) => {
      if (!dragAltRef.current) return;
      const id = dragIdRef.current;
      if (!id || id === targetId) return;
      if ((ownerBySession.get(id) ?? null) !== (ownerBySession.get(targetId) ?? null)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      const rect = event.currentTarget.getBoundingClientRect();
      setRowDrop({ id: targetId, after: event.clientY - rect.top > rect.height / 2 });
    },
    onRowDragLeave: (targetId) => {
      setRowDrop((current) => (current && current.id === targetId ? undefined : current));
    },
    onRowDrop: (event, targetId, nextId) => {
      event.preventDefault();
      if (!dragAltRef.current) return;
      const id = dragIdRef.current;
      dragIdRef.current = null;
      dragAltRef.current = false;
      setRowDrop(undefined);
      if (!id || id === targetId) return;
      const wsId = ownerBySession.get(targetId);
      if (wsId === undefined || wsId === null || wsId === '') {
        showToast(t('toast.reorderUngrouped'));
        return;
      }
      // Top half of the target row → insert before it; bottom half → after it
      // (beforeSessionId omitted appends at the end of the workspace order).
      const rect = event.currentTarget.getBoundingClientRect();
      const after = event.clientY - rect.top > rect.height / 2;
      const beforeId = after ? nextId : targetId;
      Promise.resolve()
        .then(() => actions2.insertSessionBefore(wsId, id, beforeId))
        .then(() => showToast(t('toast.reordered')), () => showToast(t('toast.actionFailed')));
    },
    openSessionRename: (sessionId, title) => {
      setMenu(undefined);
      setSessionRenameTarget({ sessionId, title });
    },
    closeSessionRename: () => setSessionRenameTarget(undefined),
    saveSessionRename: async (sessionId, value) => {
      const title = typeof value === 'string' ? value.trim() : '';
      setSessionRenameTarget(undefined);
      if (title === '') return;
      try {
        await actions2.renameSession(sessionId, title);
        showToast(t('toast.renamed'));
      } catch (error) {
        showToast(error && error.message === 'not-open' ? t('toast.renameNotOpen') : t('toast.renameFailed', { reason: String((error && error.message) || error) }));
      }
    },
    forkSession: (sessionId) => {
      setMenu(undefined);
      Promise.resolve().then(() => actions2.forkSession(sessionId)).then(
        () => showToast(t('toast.forked')),
        () => showToast(t('toast.actionFailed')),
      );
    },
    archiveSession: (sessionId) => {
      setMenu(undefined);
      Promise.resolve().then(() => actions2.archiveSession(sessionId)).then(
        () => showToast(t('toast.archived')),
        () => showToast(t('toast.actionFailed')),
      );
    },
    openDeleteConfirm: (sessionId, title) => {
      setMenu(undefined);
      setDeleteTarget({ sessionId, title });
    },
    closeDeleteConfirm: () => setDeleteTarget(undefined),
    confirmDelete: (sessionId) => {
      setDeleteTarget(undefined);
      try {
        actions2.deleteSession(sessionId);
        showToast(t('toast.deleted'));
      } catch {
        showToast(t('toast.actionFailed'));
      }
    },
    onFolderContextMenu: (event, status) => openMenu(event, 'folder', status),
    closeMenu: () => setMenu(undefined),
    closeNote: () => setNoteTarget(undefined),
    closeRename: () => setRenameTarget(undefined),
    openRename: (status) => {
      setMenu(undefined);
      setRenameTarget(status);
    },
    resetName: (status) => {
      setMenu(undefined);
      viewApi.setFolderName(status, '');
      showToast(t('toast.nameReset'));
    },
    saveName: (status, value) => {
      viewApi.setFolderName(status, value);
      setRenameTarget(undefined);
      const trimmed = typeof value === 'string' ? value.trim() : '';
      showToast(trimmed === '' ? t('toast.nameReset') : t('toast.nameSaved'));
    },
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
      dragAltRef.current = !!(event.altKey || event.ctrlKey);
      if (event.dataTransfer) {
        event.dataTransfer.setData('text/plain', sessionId);
        try { event.dataTransfer.setData('application/x-dsh-session-board', sessionId); } catch {}
        event.dataTransfer.effectAllowed = 'move';
      }
    },
    onDragEnd: () => {
      dragIdRef.current = null;
      dragAltRef.current = false;
      setDropKey(undefined);
      setRowDrop(undefined);
    },
    onDragOver: (event, key, groupKey) => {
      if (dragAltRef.current) return; // Alt+drag reorders; folders take no status drops
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
      if (dragAltRef.current) { dragAltRef.current = false; setRowDrop(undefined); return; }
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

  const openMenu = (event, kind, payload) => {
    event.preventDefault();
    const rootRect = rootRef.current ? rootRef.current.getBoundingClientRect() : { left: 0, top: 0, width: 300, height: 600 };
    const x = Math.min(event.clientX - rootRect.left, Math.max(8, rootRect.width - MENU_W - 8));
    const y = Math.min(event.clientY - rootRect.top, Math.max(8, rootRect.height - MENU_H - 8));
    setMenu(kind === 'folder' ? { kind, status: payload, x, y } : { kind, sessionId: payload, x, y });
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
    menu && menu.kind === 'session' && rowById.get(menu.sessionId)
      ? h(ContextMenu, {
          key: menu.sessionId + ':' + menu.x + ':' + menu.y,
          menu,
          row: rowById.get(menu.sessionId),
          io,
        })
      : null,
    menu && menu.kind === 'folder'
      ? h(FolderMenu, {
          key: 'folder:' + menu.status + ':' + menu.x + ':' + menu.y,
          menu,
          io,
        })
      : null,
    noteTarget
      ? h(NoteModal, { target: noteTarget, io })
      : null,
    renameTarget
      ? h(RenameModal, { status: renameTarget, names: view.names, io })
      : null,
    sessionRenameTarget
      ? h(SessionRenameModal, { target: sessionRenameTarget, io })
      : null,
    deleteTarget
      ? h(DeleteConfirmModal, { target: deleteTarget, io })
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
      setFolderName: (status, name) => view.setFolderName(status, name),
    },
    // Session management surface, mirroring the built-in browser's actions
    // (rename via the session binding; fork/archive via uiWorkspace; delete via
    // the desktop session-manage global; reorder via the workspace controller).
    actions2: {
      renameSession: async (sessionId, title) => {
        const session = sessions.binding(sessionId)?.session;
        if (session === void 0) throw new Error('not-open');
        const result = await session.rename(title);
        if (!result.ok) throw new Error((result.error && result.error.message) || 'rename failed');
      },
      forkSession: (sessionId) => {
        if (!uiWorkspace || typeof uiWorkspace.forkSession !== 'function') throw new Error('uiWorkspace unavailable');
        return uiWorkspace.forkSession(sessionId);
      },
      archiveSession: async (sessionId) => {
        if (!uiWorkspace || typeof uiWorkspace.archiveSession !== 'function') throw new Error('uiWorkspace unavailable');
        await uiWorkspace.archiveSession(sessionId);
      },
      deleteSession: (sessionId) => {
        const manager = typeof window !== 'undefined' ? window.__dshSessionManager : undefined;
        if (!manager || typeof manager.deleteSession !== 'function') throw new Error('session manager unavailable');
        manager.deleteSession(sessionId);
      },
      insertSessionBefore: (workspaceId, sessionId, beforeSessionId) =>
        workspaces.insertSessionBefore(workspaceId, sessionId, beforeSessionId),
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