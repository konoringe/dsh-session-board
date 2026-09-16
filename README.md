# dsh-session-board

> dsh（DeepSeek Harness）Web 客户端插件：把左侧会话栏改造成
> **工作区 → 四状态文件夹 → 会话** 的树形看板。
> 视觉与交互基准：[`docs/dsh-session-board-preview.html`](docs/dsh-session-board-preview.html)（概念稿）。

## 效果

- 🗂 每个工作区下固定四个文件夹：**计划中 / 未完成 / 已完成 / 已归档**，带彩色圆点与计数徽标
- 💬 会话行：标题省略、📝 备注图标（悬停显示备注）、「待归类」虚线标记（未归类会话落在**计划中**，半透明展示，不强制处理）
- 🖱 **右键会话**：归类到四状态（当前状态打 ✓）· 重命名 · 编辑备注 · 分叉 · 归档 · 删除对话（二次确认）· 在主区打开
- ↕ **Alt+拖拽会话** = 在工作区内排序（写入 dsh 手动排序，普通拖拽仍是改状态）
- 🫳 **拖拽会话进文件夹**归类；空文件夹可作投放区；**跨工作区拖拽被拒**并 toast 提示
- 🔍 顶部搜索框即时过滤会话
- 🏷 **右键文件夹可自定义名称**（四个文件夹均支持；清空恢复默认；同步作用于「归类到」菜单；持久化）
- 📂 **空文件夹默认折叠**，点击展开后即为你手动选择的状态；折叠的空文件夹仍可直接拖入
- ✅ 状态/备注改动即时生效并持久化（按 dsh profile 隔离），刷新/重启后保留
- 🌐 跟随 dsh 语言设置（内置 zh / en 词典，经 `ctx.locale.register` 注册）

## 安装

以 GitHub 安装为基准。profile 名按环境选择：**桌面客户端用 `desktop`，纯 Web UI（`dsh web`）用 `web`**，自定义 profile 换成对应名字即可。

### 方式一：自己安装

1. 执行安装：

   ```bash
   dsh plugin --profile desktop add --prod github:konoringe/dsh-session-board
   ```

2. pnpm 若询问是否允许运行构建脚本（allowBuilds），放行 `dsh-session-board`；
   仓库已附带构建好的 `lib/client.js`，构建被跳过时也能直接使用。
3. 重启 Web 服务（桌面客户端：重启客户端或设置里的重启入口）并刷新页面。

卸载：`dsh plugin --profile desktop remove dsh-session-board`——layer 出栈即完全
逆注册，无残留（客户端注册随 bundle 卸载自动回收）。

### 方式二：让 AI 助手代装

把下面这段话发给正在目标 dsh 实例中工作的 AI 助手即可：

> 请帮我安装 dsh-session-board 插件：
> 1. 执行 `dsh plugin --profile desktop add --prod github:konoringe/dsh-session-board`；
>    若 pnpm 询问构建脚本放行，允许 dsh-session-board。
> 2. 完成后提醒我重启 Web 服务并刷新页面。
> 3. 验收：左栏变为「工作区 → 计划中/未完成/已完成/已归档」树形看板；
>    右键文件夹可重命名；底部无状态页脚。
>
> 纯 Web UI（`dsh web`）环境请把 profile 名换成 `web`。

### 本地开发安装（仅改代码的开发者）

```bash
git clone https://github.com/konoringe/dsh-session-board
dsh plugin --profile desktop add --prod link:<克隆目录的绝对路径>
```

`link:` 安装是符号链接：改源码后重启 Web 服务即生效，无需重新 add；
`--prod` 跳过 vitest 等开发依赖，profile 安装保持最小。

### 安装机制说明

`dsh plugin add` 会在 profile 目录内执行 `pnpm add`，随后按包内
`package.json → dsh.bundle` 声明把插件挂入 layer 栈（见 `cordis.patch.yml`）。

## 数据与持久化

| 数据 | 位置 | 说明 |
|---|---|---|
| 会话状态 + 备注 | 浏览器 localStorage：`dsh.session-board.meta.v1` | 按 webview origin（= dsh profile）隔离；schema 带 `version` 字段，损坏自动回退 |
| 展开/折叠状态 + 文件夹自定义名 | localStorage：`dsh.session-board.view.v1` | 展开仅记录显式覆盖；默认「计划中/未完成」展开、当前会话所属工作区展开、空文件夹折叠；名称留空即恢复默认 |

会话与工作区本身完全沿用 dsh 官方数据（`sessions` / `workspaces` 服务），
**不复制、不缓存会话内容**；分组依据 = `workspace.sessionIds`（与内置浏览器一致），
子代理会话、已归档会话、空白会话（除当前）按内置规则隐藏。

**升级路线**（对应计划书「服务层」）：host 侧已预留零依赖激活层（见 `src/index.js`
的 `describe()`），后续接入 Remote namespace 后把存储切到
`$DSH_HOME/profiles/<profile>/session-board/state.json`（`dsh-atomic-write`
原子写 + `withFileLock`），客户端仅替换存储后端、UI 不变。

## 架构

```
src/
├── index.js          # host 侧：零依赖激活层（诊断日志 + 未来 host 存储接缝）
└── client/
    ├── core.js       # 纯逻辑（零 import，可单测）：派生树 + meta/view 两个持久化 store
    └── board.js      # React 组件 + 右键菜单/拖拽/弹层/toast + zh/en 词典 + 样式注入
lib/client.js         # 构建产物：window.__ModuleLoader__ 包裹的客户端 bundle
scripts/build-client.mjs  # 构建脚本（无打包器依赖，可审计）
tests/                # vitest 单测：分组语义 / 可见性 / store 持久化 / 迁移
```

关键机制：

- **接管点**：插件把看板组件注册进 root 作用域 single slot
  `sidebar.workspaces`（内置工作区浏览器所在的席位）。single 席位按
  **priority 遮蔽**渲染——格内所有存活注册者按 priority 升序排，**最低者渲染**，
  同 priority 的第二次注册会抛错。内置浏览器以默认 priority 0 注册，看板因此以
  `priority: -1` 注册：无论 bundle 加载顺序谁先谁后都稳定接管，不抛错、不竞态。
- **组件契约**：业务数据全部由框架派生——`inject()` 返回
  `{ hooks: { sessions, workspaces, meta, view }, actions, openSession }`，
  ledger 自动包装成 `useSessions(sel)` 等选择器 hook；`locale: NS` 注入类型化
  `t`。组件内不接触插件 ctx。
- **点击会话**：优先走 `uiWorkspace.openSession`（与内置一致的导航 + 关面板），
  缺席时回退 `sessions.open` + `layout.selectPanel(null)`。
- **样式**：手写作用域类名（`dsb-*` 前缀）一次性注入 `<style data-plugin-css>`，
  对齐内置插件做法；中性色用半透明叠加适配明暗主题；菜单/弹层/Toast 的底色与文字
  绑定 dsh 主题令牌（`--dsw-specific-menu` / `--dsw-alias-label-primary`，含后备链），
  深浅皮肤（含以高优先级选择器统一改写文字颜色的皮肤）下都保持可读。

## 开发

```bash
pnpm install        # 安装 vitest
pnpm build          # 重新生成 lib/client.js（也可 node scripts/build-client.mjs）
pnpm test           # vitest 单测
```

bundle 无需打包器：构建脚本只做「剥 import/export → 拼接 → 包
`__ModuleLoader__.load` 壳」这一可审计变换（客户端仅依赖平台种子模块 `react`，
故不需要 `dsh.client.external`）。修改源码后 `pnpm build` + 重载页面（HMR 生效
时自动）即可看到效果。

## 验收清单（对照计划书）

- [x] 树形分组随工作区正确渲染（含「未分组」兜底组）
- [x] 归类 / 备注即时生效且重启后保留（localStorage，按 profile 隔离）
- [x] 跨工作区拖拽被拒并提示（会话归属其工作目录）
- [x] 卸载可逆无残留（layer 出栈；客户端注册随 bundle 回收）
- [x] 空态处理（无工作区提示 / 空文件夹「可拖入」投放区）
- [x] 四状态流转正确（状态变更自动记录时间戳）
- [x] 中英双语词典（`ctx.locale.register`，key-set 以 zh 为准）
- [x] 文件夹自定义名称（v0.2，持久化 + 菜单联动 + 恢复默认）
- [x] 空文件夹默认折叠（v0.2，显式操作优先，拖入路径不受影响）
- [x] 会话操作回归（v0.3：重命名/分叉/归档/删除，删除依赖桌面端会话管理器并二次确认）
- [x] Alt+拖拽排序（v0.3，写入工作区手动排序；普通拖拽保持改状态语义）
- [ ] 大量会话（>500）压测 —— 结构上为 O(n) 派生 + memo，待实测
- [ ] host 侧 state.json 存储（已预留 `sessionBoard` 服务与存储路径，待 Remote namespace）

## 已知限制

- 主区头部（概念稿的会话状态 pill）属于 dsh 内置布局区域，本版未改动；状态/备注
  按计划只出现在侧栏与右键菜单。
- 接管期间右键菜单/弹层用绝对定位锚在看板根部（避免依赖 portal 与
  `react-dom`），极端情况下会被侧栏边界裁剪而非溢出。
- dsh 处于 developer preview，slot/服务名可能调整；本插件对内部 API 的依赖已收敛
  在 `board.js` 顶部常量与 `apply` 一处，便于跟进。