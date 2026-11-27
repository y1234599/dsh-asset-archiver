# dsh-asset-archiver

DeepSeek Harness 插件：把本地会话与选定的工作区文件归档到阿里云 OSS，并在其他设备上拉取、恢复。

当前版本 **1.3.2**：在 1.0.0 的工作区级上传/下载基础上，新增**工作区文件树形选择、按需上传与拉取**、拉取页的**文件同步开关**，以及参考 `dsh-session-manager` 的**浮层窗口**。

## 功能

- 侧栏底部插件入口，点击后打开**浮层窗口**（遮罩 + 居中面板），不替换 DSH 原有会话界面；
- 首次打开创建 `DSH_HOME/dsh-asset-archiver/config.yml`，设置页支持校验与连接测试；
- 上传：
  - **仅勾选工作区不会上传任何工作区文件**；
  - 点击工作区行展开文件树，文件夹可继续展开/收起；
  - 勾选文件夹会选中其下全部可上传文件（文件夹复选框支持全选/半选状态），也可展开后逐个勾选文件；
  - 每个工作区提供整体的「全选 / 清空」；
  - 每个会话写一个对象，工作区写 `manifest.json`（含会话索引与文件索引）；
- 拉取：浏览云端工作区，选择本地目录；
  - 默认只恢复会话，不拉取工作区文件；
  - 卡片工作区名右侧的「同步工作区文件」开关打开后，才会同时拉取已归档的文件；切换到其他工作区时开关恢复关闭；
- 恢复写入持久化会话（不创建无预设的 live Agent），并保留 `header.agentPreset`；DSH 打开会话时按该预设挂载工具、persona 与 skill；目标没有该预设时回退默认预设并提示；已存在的同 id 会话与同路径文件跳过；
- Host 结构化日志（AccessKey 与敏感字段脱敏）。

## 环境

- DSH `0.2.2-rc.5`（`dsh.compatibility` 声明）；Node.js ≥ 24.9；
- 私有阿里云 OSS 桶；RAM 子账号至少具备 `ListObjects`、`GetObject`、`PutObject`、`AbortMultipartUpload`（前缀范围内）。

## 安装

1. 在 DSH 的 **插件 / Plugins** 页面选择 **添加插件**，指向本目录的绝对路径；或由 Agent 用 `plugin_manager` 的 `install_bundle` 安装。
2. 安装后启用 `include:dsh-asset-archiver`。
3. 安装依赖由 DSH 的插件管理器执行，需要 **pnpm**：
   - DSH Desktop 安装包自带 pnpm，通常无需系统安装；
   - DSH Web、CLI、源码启动或 npm 安装的 dsh 需要 `pnpm` 在 `PATH` 中。

### `spawn pnpm ENOENT` / 退出码 127

这表示 DSH 找不到 `pnpm` 可执行文件，不是插件代码错误。先安装并验证：

```powershell
node --version
npm --version
npm install -g pnpm
pnpm --version
where.exe pnpm
```

如果 `pnpm --version` 仍不可用，通常是 npm 全局目录不在 `PATH`：

```powershell
npm config get prefix
# 将输出目录（通常是 %APPDATA%\npm）加入用户 PATH，然后重开终端
```

然后**完全退出 DSH 并重新启动**（Windows 从托盘退出，不能只刷新页面），再从新终端启动 Web/CLI。

macOS / Linux：

```bash
npm install -g pnpm
pnpm --version
command -v pnpm
```

补充说明：

- 没有 Node/npm 时，先安装 Node.js 24 LTS；仅安装 DSH Desktop 不会自动把 pnpm 暴露到系统 `PATH`。
- 不要用“手动复制插件目录”代替安装；DSH 需要 pnpm 把插件登记到 profile 并安装 `ali-oss` 依赖。
- 如果使用 DSH Desktop 仍报同样错误，请确认操作的是桌面应用的插件页，而不是浏览器里另开的 `dsh web` 会话；必要时安装系统 pnpm 作为兼容方案，并反馈 DSH 版本。

## 使用

1. 点击侧栏底部插件入口，打开浮层窗口。
   - 窗口覆盖在 DSH 之上，背景保留；不切换主面板。
   - 关闭方式：右上角「关闭」、点击遮罩、按 Esc。
2. 首次使用进入「设置」，填写：
   - `endpoint`（如 `oss-cn-hangzhou.aliyuncs.com`）
   - `region`（如 `oss-cn-hangzhou`）
   - `access-key-id` / `access-key-secret`
   - `bucket-name`
   - 可选 `prefix`（默认 `dsh-asset-archiver`）
3. 「测试连接」通过后保存。
4. 「上传」页：
   - 直接勾选工作区 → 只上传该工作区的会话；
   - 点击工作区名称展开文件树 → 展开文件夹查看子项 → 勾选文件夹（其下全部文件）或逐个勾选文件；
   - 文件树顶部的「全选/清空」作用于整个工作区；
   - 「上传全部工作区」上传所有会话，并只上传已勾选的文件。
5. 在另一台设备（或新目录）「拉取」页刷新云端、选择工作区、选择本地目录；
   - 需要文件时打开工作区名右侧的「同步工作区文件」开关，默认关闭；
   - 拉取会恢复会话；开关打开时同时恢复文件；
   - **1.3.2 及更早版本已拉取的会话没有保存 agent preset，需删除本地副本后重新拉取**，否则会保留“无工具”状态。
   - 拉取只写入会话记录；如果 DSH 侧栏尚未出现新会话，刷新一次会话列表即可。

## 浮层窗口说明

- 插件注册了 `sidebar.footer.action` 入口与 `shell.overlay` 浮层；不注册 `main` 面板，因此不会切换或占用 DSH 的会话界面。
- 打开方式参考已安装插件 `dsh-session-manager`：全屏遮罩 + 居中 Dialog，使用宿主主题令牌；窗口尺寸为 DSH 窗口宽度的 **50%**、高度的 **70%**。
- 窗口打开时锁定页面滚动，按 Esc、点击遮罩或点「关闭」均可退出。
- 所有操作仍通过同一套 `/api-asset-archiver/*` 接口与 DSH 宿主服务完成。

## 数据布局

```text
<DSH_HOME>/dsh-asset-archiver/config.yml              # 插件配置（明文 AccessKey，0600）
<bucket>/<prefix>/v1/workspaces/<workspaceKey>/
  manifest.json                                       # 工作区元数据 + 会话索引 + 文件索引
  sessions/<sessionId>.json                           # 单个会话包（header + 事件）
  files/<encoded workspace-relative path>             # 单个工作区文件
```

`manifest.json` 的 `files` 字段为可选数组：`{path, bytes, sha256, contentType, uploadedAt}`。旧清单没有该字段时按无文件处理。

## 文件规则与限制

- 只列出普通文件；符号链接、`node_modules`、`.git`/`.hg`/`.svn` 被跳过；
- 文件以原工作区相对路径保留树形结构；空目录不保留（没有文件即不产生目录）；
- 单文件上限 100 MB；单次列表上限 2000 个文件（超出会提示列表被截断）；
- 上传/拉取使用工作区相对路径，拒绝绝对路径与 `..`；拉取时校验 SHA-256；
- 本地已存在的同路径文件不会覆盖（跳过），因此云端文件更新后不会自动改写本地文件；
- 拉取页的文件同步开关默认关闭；关闭时只拉取会话，不访问任何文件对象；
- 不支持删除、重命名同步与冲突覆盖策略，删除/重命名需后续版本处理；
- 工作区文件是上传时的快照，不会与本地持续同步。

## 已知限制

- 会话仍为工作区级上传/下载，暂不支持会话级勾选；
- 本地同 id 会话默认跳过，暂不提供覆盖/副本策略；
- 不迁移会话附件/图片对象（与工作区文件不同）；
- 任务同步执行，无后台队列/进度/取消；
- 不做跨 DSH 版本的会话格式迁移；
- 仅提供中文界面。

## 开发

```powershell
npm run typecheck   # tsc --noEmit
npm test            # node:test via tsx（37 项）
npm run build       # esbuild -> lib/index.js + lib/client.js
npm run check       # 全部执行
```

目录与数据不变量见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)，变更记录见 [`CHANGELOG.md`](CHANGELOG.md)。

## 许可

MIT
