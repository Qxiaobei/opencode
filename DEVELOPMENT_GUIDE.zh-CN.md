# OpenCode 源码架构与二次开发指南

本文面向第一次接触 OpenCode 源码的开发者，也面向准备修改 CLI、TUI、Web、桌面端、Server、模型接入、工具、插件或 SDK 的二次开发者。内容以当前 `dev` 分支的实际源码为准。

> 当前仓库处在持续重构阶段。成熟的旧实现与新版分层会同时存在。开发前先判断功能属于哪条链路，不要仅凭目录名称猜测。

## 1. OpenCode 是什么

OpenCode 是一个以 AI 编程会话为核心的多端应用。它主要提供：

- 命令行入口和交互式 TUI；
- 浏览器 Web 客户端；
- Electron 桌面客户端；
- Headless HTTP Server；
- Session、消息、上下文、工具调用和权限管理；
- AI Provider、模型、认证和配置管理；
- MCP、ACP、插件、Skill、LSP、PTY 和文件系统能力；
- Promise/Effect Client、旧 SDK 和新版嵌入式 SDK；
- Console、Enterprise、Slack、Stats 等配套应用。

最重要的理解是：Web、桌面端和 TUI 不是三套独立产品，它们最终都围绕 OpenCode Server 提供的会话和工具能力工作，只是宿主、传输方式和界面不同。

## 2. 技术栈

仓库的主要技术包括：

| 领域 | 技术 |
| --- | --- |
| 运行时与包管理 | Bun 1.3.14 |
| 辅助 Node 运行时 | Node.js 22（部分 Vite/Electron 工具） |
| 语言 | TypeScript |
| Effect 服务 | Effect 4 beta |
| HTTP API | Effect HttpApi / HttpRouter |
| Web UI | SolidJS、Vite、Tailwind CSS |
| 桌面端 | Electron、electron-vite、electron-builder |
| TUI | OpenTUI、SolidJS |
| 数据库 | SQLite、Drizzle、Effect SQL |
| 测试 | Bun Test、Playwright |
| Monorepo | Bun Workspaces、Turborepo |

根目录 `package.json` 固定了 Bun 版本。开发机应优先使用同一版本，避免锁文件、原生依赖和脚本行为不一致。

## 3. 先看整体运行架构

### 3.1 Web 开发模式

```text
Browser
  │ http://localhost:3000
  ▼
packages/app（SolidJS + Vite）
  │ HTTP / SSE / WebSocket
  ▼
packages/opencode 中启动的 Server
  │
  ├─ Session / Provider / Tool / Permission
  ├─ Project / Config / Plugin / MCP / LSP
  └─ SQLite / Filesystem / PTY
```

Web 前端和 Server 是两个进程。开发环境默认前端端口是 `3000`，前端默认寻找 `localhost:4096` 的 Server。Server 可通过项目配置固定端口和 CORS。

### 3.2 桌面开发模式

```text
Electron Main
  ├─ Renderer（复用 packages/app 和 packages/ui）
  ├─ Preload（受控 IPC 边界）
  └─ Sidecar Server
       ├─ 默认 v1：由 packages/opencode 源码构建并嵌入
       └─ 实验 v2：预编译 opencode-cli 后台 service
```

桌面端默认使用 `v1` Sidecar。`packages/desktop/scripts/predev.ts` 会准备 Electron、图标、Node Server 构建和桌面 CLI 资源。只有设置 `OPENCODE_SIDECAR_V2=1` 时，桌面端才选择 v2 后台 CLI。

### 3.3 TUI/CLI 模式

```text
CLI 参数解析
  ├─ serve / web / run / attach / mcp / providers ...
  └─ 默认 TUI
       │ SDK / Server transport
       ▼
     OpenCode Server
```

当前成熟 CLI 入口仍在 `packages/opencode/src/index.ts`。新的 `packages/cli` 和 `packages/tui` 正在承接拆分后的宿主与界面能力。

## 4. 仓库顶层目录

| 路径 | 用途 |
| --- | --- |
| `packages/` | 产品、核心库、客户端、SDK 和配套应用 |
| `specs/` | v2、Session、Config、Tool、存储等设计规格 |
| `script/` | 仓库级构建、发布、翻译和维护脚本 |
| `sdks/` | 编辑器等外部 SDK/集成，目前包含 VS Code |
| `github/` | GitHub Agent 相关内容 |
| `.github/` | Actions、Issue/PR 模板和仓库自动化 |
| `.opencode/` | OpenCode 自身使用的 Agent、Command、Skill、插件配置 |
| `patches/` | Bun patchedDependencies 使用的依赖补丁 |
| `AGENTS.md` | 全仓库开发约束 |
| `CONTEXT.md` | 当前 Session Runtime 和新版架构语义 |
| `bun.lock` | Bun 锁文件 |
| `turbo.json` | Monorepo 任务编排 |

## 5. packages 目录详解

### 5.1 产品入口

#### `packages/opencode`

当前最完整的 OpenCode 应用和兼容层，包含：

- `src/index.ts`：成熟 CLI 入口；
- `src/cli/cmd`：`serve`、`web`、`run`、`attach`、`mcp` 等命令；
- `src/server`：现有 Server 组装和兼容路由；
- `src/session`：成熟 Session、消息、Prompt 和 LLM 流程；
- `src/provider`：Provider/模型接入；
- `src/tool`：文件、Shell、搜索等工具；
- `src/config`：配置发现、合并和迁移；
- `src/plugin`、`src/mcp`、`src/lsp`、`src/permission` 等成熟能力。

修改现有用户可见行为时，通常仍需先从这里追踪调用链。

#### `packages/app`

SolidJS Web 应用，也是桌面 Renderer 复用的主要界面层：

- `src/entry.tsx`：Web 入口和默认 Server 地址；
- `src/app.tsx`：应用组合；
- `src/pages`：首页、布局、新会话和会话页；
- `src/context`：全局同步、文件、语言和平台状态；
- `src/components`：业务组件；
- `src/utils`：Server 协议、请求、草稿等工具；
- `vite.config.ts`：Web Vite 配置。

#### `packages/desktop`

Electron 桌面应用：

- `src/main`：窗口、菜单、升级、日志、Sidecar、WSL 和生命周期；
- `src/preload`：Renderer 可调用的安全 API；
- `src/renderer`：Electron Renderer 入口；
- `electron.vite.config.ts`：Main、Preload、Renderer 三套构建配置；
- `electron-builder.config.ts`：安装包配置；
- `scripts/predev.ts`：开发前资源准备；
- `scripts/prebuild.ts`：打包前资源准备。

Renderer 不应直接使用 Node/Electron 能力，应通过 `window.api` 和 Preload IPC。

#### `packages/tui`

正在抽取的独立 TUI 包，拥有组件、路由、主题、Keymap、Prompt UI 和 SDK 同步。目标是让旧 CLI 和新 CLI 复用同一套 TUI，而不是维护两份界面。

#### `packages/cli`

新版 CLI 宿主，负责命令解析、Server 生命周期和 TUI 启动。它与 `packages/opencode` 并存，说明 CLI 拆分仍在迁移中。

### 5.2 新版核心分层

新版运行时依赖方向必须保持：

```text
Schema ──────► Core
   │            │
   └────► Protocol
                │
Core + Protocol ▼
              Server
                │
              Client
                │
Core + Server + Client
                ▼
             sdk-next
```

更准确的约束是：

- `schema` 是轻量公共数据叶子包；
- `core` 可依赖 `schema`，实现领域行为；
- `protocol` 可依赖 `schema`，定义路径、输入、输出、错误和中间件位置；
- `server` 依赖 `core` 与 `protocol`，把协议映射到实现；
- `client` 运行时代码只能依赖 `schema` 和 `protocol`，不能依赖 `core` 或 `server`；
- `sdk-next` 在更高层组合 Client、Core 和 Server。

#### `packages/schema`

公共 Schema、品牌类型和跨边界数据结构。适合放置 Client、Protocol、Core 都需要理解的稳定值，不应引入数据库、Provider、文件系统或 Server。

#### `packages/core`

新版 Effect 领域运行时，主要包含：

- Session V2、Execution、Runner；
- Event V2 和持久化事件；
- Tool Registry、Permission；
- System Context；
- Project、Filesystem、PTY；
- Config、Credential、OAuth、Plugin、Skill；
- 数据库和应用 Layer 组装。

#### `packages/protocol`

公共 HTTP 协议定义。`src/groups` 定义 API 分组，`src/middleware` 定义协议需要的中间件位置。它不应导入 Core 或 Server。

#### `packages/server`

协议到领域实现的适配层，包含 Handler、Middleware 和公共 CORS 等服务。Server 负责提供 Protocol 所需的真实服务和错误映射。

#### `packages/client`

从权威 HttpApi 生成的客户端：

- 根导出：基于 `fetch` 的零 Effect Promise Client；
- `/effect`：使用 Effect HttpClient 的富类型 Client；
- `src/generated`：Promise 生成物；
- `src/generated-effect`：Effect 生成物。

不要手工修改生成目录。公共 Protocol 或 Server HttpApi 改动后，在 `packages/client` 执行：

```bash
bun run generate
```

#### `packages/sdk-next`

新版嵌入式 SDK。它在同一进程内执行 Server Router，不开启网络监听，但保留相同路由、Middleware、Codec 和错误语义。它最终计划替代旧 `@opencode-ai/sdk`。

### 5.3 SDK、插件和 AI 基础设施

| 包 | 用途 |
| --- | --- |
| `packages/sdk/js` | 旧版生成 SDK；修改后用 `./packages/sdk/js/script/build.ts` 重新生成 |
| `packages/plugin` | 插件公开接口和构建 |
| `packages/llm` | Provider 中立的 LLM 请求、流和适配能力 |
| `packages/codemode` | 基于 Schema 描述工具的受限代码执行 |
| `packages/http-recorder` | Effect HTTP 流量录制和回放 |
| `packages/httpapi-codegen` | HttpApi 到客户端代码的生成基础设施 |
| `packages/script` | 版本、Channel 和发布脚本公共逻辑 |

### 5.4 UI 和辅助应用

| 包 | 用途 |
| --- | --- |
| `packages/ui` | 通用 UI 组件、主题、图标和样式 |
| `packages/session-ui` | Web/桌面共享的 Session 展示与 Diff/Worker 能力 |
| `packages/storybook` | UI 和 Session UI 组件预览 |
| `packages/web` | 官网或独立 Web 内容 |
| `packages/enterprise` | 企业版应用 |
| `packages/console/*` | Console 前端、核心、邮件、资源和函数 |
| `packages/stats/*` | 统计应用、Server 和数据层 |
| `packages/slack` | Slack 集成 |

### 5.5 数据与底层包

| 包 | 用途 |
| --- | --- |
| `effect-drizzle-sqlite` | Effect 与 Drizzle SQLite 的组合 |
| `effect-sqlite-node` | Node SQLite Effect 实现 |
| `function` | 通用函数相关能力 |
| `containers` | 容器支持 |
| `identity` | 身份相关代码 |

## 6. “旧版单体 + 新版分层并存”是什么意思

它不是说仓库有两个完全独立的 OpenCode，而是同一个产品正在按功能逐步搬迁。

旧链路常见形态：

```text
packages/opencode/src/cli
  ├─ 直接调用 packages/opencode 内部 Session
  ├─ 直接调用 Provider、Tool、Config
  └─ 同时负责宿主、领域和展示
```

目标链路：

```text
CLI / TUI / App
      │
Client / SDK
      │
Protocol + Server
      │
Core + Schema
```

迁移采用逐片替换，而不是一次性重写，因此会看到：

- `packages/opencode/src/session` 与 `packages/core/src/session` 同时存在；
- `packages/opencode` 和 `packages/cli` 同时存在；
- 旧 TUI 路径和 `packages/tui` 的迁移痕迹同时存在；
- `packages/sdk/js` 与 `packages/sdk-next` 同时存在；
- v1 配置/数据兼容类型仍保留在 Core 或 Schema 中；
- Server 已迁到 Effect HttpApi，但仍有兼容层和清理任务。

判断代码属于哪一代时，可以观察：

1. 是否位于 `packages/opencode/src` 的成熟实现；
2. 是否通过 `Schema/Core/Protocol/Server` 的边界组合；
3. 是否引用 `v1`、`v2`、`legacy`、`compat`；
4. 是否在 `specs/v2/todo.md` 或迁移规格中标为未完成；
5. UI 是否通过 SDK/Client，还是直接导入后端私有模块。

不要为了“看起来更新”把旧代码机械移动到 Core。先确认新边界是否已有等价服务、Protocol 和 Client API。

## 7. Session 和请求数据流

### 7.1 成熟链路

成熟功能主要仍由 `packages/opencode` 承担：CLI/Server 接收请求，解析 Project、Config、Provider 和 Agent，构建 Prompt，运行模型循环，执行 Tool，再通过事件把结果同步到 UI。

### 7.2 V2 链路

V2 更强调持久化和清晰边界：

```text
Prompt 请求
  ▼
SessionV2.prompt
  ▼
持久化 session_input（Admitted Prompt）
  ▼
SessionExecution.wake(sessionID)
  ▼
SessionRunner 在安全边界提升输入
  ▼
组装 Session History + System Context
  ▼
llm.stream(request)
  ▼
持久化消息、工具调用、结果和事件
```

关键概念：

- Prompt Admission：先可靠接收输入，不等于已发给模型；
- Prompt Promotion：在安全边界把输入加入模型可见历史；
- Session Drain：本进程的一次运行区间，不是持久化实体；
- Provider Turn：一次模型请求和响应；
- System Context：由多个 Context Source 组成的系统上下文；
- Context Epoch：一段使用同一基线系统上下文的时期；
- Event V2：持久化、可排序、可回放的事件。

详细语义以 `CONTEXT.md` 和 `specs/v2/session.md` 为准。

## 8. 本地开发环境

### 8.1 基础要求

- Git；
- Bun 1.3.14；
- Node.js 22；
- 对应平台的原生编译/运行环境；
- 桌面开发需要 Electron 资源；
- Windows 原生模块必须在 Windows 上安装，不能复制 macOS/Linux 的 `node_modules`。

安装依赖：

```bash
bun install --frozen-lockfile
```

如果正在更新锁文件，才使用不带 `--frozen-lockfile` 的安装。

### 8.2 常用启动命令

从仓库根目录执行：

```bash
# CLI/TUI
bun dev

# Headless Server
bun dev serve

# Web 前端
bun run dev:web

# Electron 桌面端
bun run dev:desktop

# Storybook
bun run dev:storybook
```

Web 开发通常打开两个终端：一个运行 Server，一个运行 Web。

### 8.3 Server 本地配置

如果不希望每次给 `serve` 命令传网络参数，可以在项目配置中写：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "server": {
    "hostname": "127.0.0.1",
    "port": 4096,
    "cors": ["http://localhost:3000", "http://127.0.0.1:3000"]
  }
}
```

局域网访问需要将 `hostname` 改为 `0.0.0.0`，加入实际前端 Origin，并为 Server 配置密码。协议、主机和端口任一不同都属于跨域。

## 9. 各类二次开发从哪里入手

### 9.1 修改 Web 页面

1. 从 `packages/app/src/pages` 找页面；
2. 从 `packages/app/src/components` 找业务组件；
3. 公共视觉组件优先放在 `packages/ui`；
4. Session 通用展示优先检查 `packages/session-ui`；
5. 数据请求优先走 Client/SDK Context，不要直接导入 Server/Core 私有实现；
6. 运行 `bun run dev:web` 验证。

### 9.2 修改桌面功能

- 窗口、菜单、升级、日志：`packages/desktop/src/main`；
- Renderer：`packages/desktop/src/renderer` 或共享 `packages/app`；
- IPC：Main 在 `src/main/ipc.ts` 注册，Preload 在 `src/preload` 暴露；
- Sidecar：`src/main/server.ts`、`sidecar.ts`、`background-cli.ts`；
- Windows/WSL：`src/main/wsl`。

修改后从 `packages/desktop` 运行：

```bash
bun typecheck
```

### 9.3 新增或修改 HTTP API

新版推荐流程：

1. 公共数据类型放 `packages/schema`；
2. 路径、输入、输出、错误放 `packages/protocol`；
3. 领域行为放 `packages/core`；
4. Handler 和适配放 `packages/server`；
5. 在 `packages/client` 重新生成 Client；
6. 更新 Server、Client 和 SDK 测试。

```bash
cd packages/client
bun run generate
bun run check:generated
```

不要直接编辑 `src/generated` 或 `src/generated-effect`。

### 9.4 新增 Provider 或模型支持

成熟 Provider 代码主要在：

```text
packages/opencode/src/provider
packages/opencode/src/auth
packages/opencode/src/plugin
```

新版 Provider/Catalog 设计同时涉及：

```text
packages/core/src/plugin/provider
packages/core/src/credential
packages/llm
packages/schema
```

先确认目标功能属于成熟 Provider 兼容修复，还是 v2 Provider 注册/模型目录能力，再决定落点。

### 9.5 新增工具

成熟工具位于 `packages/opencode/src/tool`，新版 Tool Registry 位于 `packages/core/src/tool`。一个完整工具通常涉及：

- 输入 Schema；
- Tool 描述和模型可见定义；
- 权限判断；
- Location/文件系统边界；
- 执行和输出截断；
- Session 中的持久化结果；
- Web/TUI 的展示降级。

未知工具必须能以通用形式展示，UI 不应因插件工具的未知字段崩溃。

### 9.6 插件、MCP 和 Skill

- 插件：`packages/plugin`、`packages/opencode/src/plugin`、`packages/core/src/plugin`；
- MCP：`packages/opencode/src/mcp`；
- Skill：`packages/opencode/src/skill`、`packages/core/src/skill`；
- Agent 指令：仓库或项目中的 `AGENTS.md`。

插件 v2 尚在演进，不应假设旧插件 Hook 都已有完全等价的新接口。

### 9.7 修改 TUI

新代码优先检查 `packages/tui`。宿主命令、Server 启停、认证和配置发现属于 CLI，不应搬进 TUI。TUI 应通过 SDK 获取后端能力，缺少 API 时应补 Server/SDK，而不是反向依赖 `packages/opencode` 私有模块。

## 10. 测试、类型检查和生成

### 10.1 不要在根目录运行测试

仓库根测试脚本会主动失败。进入具体包运行：

```bash
cd packages/opencode
bun test

cd packages/app
bun run test:unit

cd packages/desktop
bun typecheck
```

### 10.2 类型检查

必须从包目录运行：

```bash
bun typecheck
```

不要直接运行 `tsc`。根目录 `bun typecheck` 会调用 Turbo 检查多个包，适合依赖完整的 CI 环境。

### 10.3 代码生成

- 公共 Protocol/Server HttpApi 改动：在 `packages/client` 执行 `bun run generate`；
- 旧 JavaScript SDK：运行 `./packages/sdk/js/script/build.ts`；
- 不手工编辑 Client 生成目录。

## 11. 配置系统

OpenCode 会合并全局配置、项目配置、环境变量和命令行参数。常见文件名为：

```text
opencode.jsonc
opencode.json
config.json
```

网络命令遵循“显式命令行参数优先，否则读取配置”的原则。配置处理主要位于：

```text
packages/opencode/src/config
packages/core/src/config
packages/core/src/v1/config
```

修改配置 Schema 时要考虑：旧字段迁移、全局/项目优先级、环境变量替换、插件配置和客户端展示。

## 12. Windows 与离线开发

### 12.1 为什么不能复制其他系统的 node_modules

依赖包含平台相关可执行文件和原生模块，例如：

- Electron；
- esbuild；
- node-pty；
- 7zip 辅助程序；
- 文件监听器；
- Windows CLI。

离线包必须在 Windows x64 Runner 上安装和验证。

### 12.2 ZIP 会丢失 Workspace Junction 语义

Bun Workspace 在 Windows 上通常使用 Junction：

```text
node_modules\@opencode-ai\core
  → packages\core
```

普通 ZIP/7z 在压缩或解压时常把 Junction 展开成普通目录。结果包括：

- Vite 把内部源码当第三方依赖优化；
- `does not provide an export named 'default'`；
- `?worker&url` 被 esbuild 当文件名；
- `import.meta.dir` 从 `node_modules` 计算出错误根目录；
- 修改 `packages` 后，`node_modules` 副本不更新。

离线启动前应重建 `node_modules\@opencode-ai\*` 到实际 workspace 的 Junction，再删除 `.vite` 缓存。CMD 可使用：

```bat
mklink /J "node_modules\@opencode-ai\core" "packages\core"
```

实际脚本应只替换仓库中存在源码的工作区包，不应覆盖预编译 CLI 等外部包。

### 12.3 Web 常见问题

- 全局 `vite` 可能不是项目版本，优先直接运行项目入口；
- 项目当前 Vite 版本由根 `package.json` Catalog 决定；
- 修改依赖优化配置或 Junction 后必须删除 `.vite`；
- `lru_map` 是第三方 CommonJS 依赖，可能仍需 `needsInterop`；
- CORS 错误和 ESM 导出错误是两类问题，不应混为一谈。

### 12.4 桌面端离线资源

桌面开发至少需要：

```text
node_modules\electron\dist\electron.exe
packages\desktop\resources\opencode-cli.exe
packages\opencode\dist\node\node.js
```

Electron 和预编译 CLI 应在联网 Windows Runner 上提前准备。Node 22 可由目标机预装，不必强制放入离线包。

## 13. 调试路径

遇到问题时按层排查：

1. **依赖层**：目标平台二进制是否存在，Workspace 是否为 Junction；
2. **构建层**：Vite/esbuild/Electron-Vite 是否使用项目版本；
3. **浏览器层**：先看第一个 SyntaxError，再看接口和 CORS；
4. **传输层**：Server 地址、端口、HTTP/SSE/WebSocket；
5. **Server 层**：健康检查、日志、配置、数据库；
6. **领域层**：Session、Provider、Tool、Permission；
7. **平台层**：Electron Main/Preload/Renderer 或 TUI Host。

常用命令：

```bat
node .\node_modules\vite\bin\vite.js --version
node_modules\@esbuild\win32-x64\esbuild.exe --version
dir /AL node_modules\@opencode-ai
```

桌面日志通常位于用户 AppData 下对应的 `ai.opencode.desktop.*\logs` 目录。

## 14. 代码风格和贡献规则

重要规则摘要：

- 默认分支是 `dev`；
- 分支名最多三个单词，用短横线分隔；
- Commit 使用 `type(scope): summary`；
- 优先 `const`、早返回和类型推断；
- 避免 `any`、不必要的 `try/catch` 和单次使用的小函数；
- 不使用重命名 Import 或星号 Import；
- Effect Generator 先绑定服务，再调用方法；
- Drizzle 字段使用 snake_case；
- 测试真实实现，尽量避免 Mock；
- 修改某个包前先阅读该目录中的 `AGENTS.md`。

以根 `AGENTS.md` 和包内 `AGENTS.md` 为最终准则。

## 15. 推荐的源码阅读顺序

### 初学者

1. 根 `package.json`；
2. `packages/opencode/src/index.ts`；
3. `packages/opencode/src/cli/cmd/serve.ts`；
4. `packages/app/src/entry.tsx`；
5. `packages/app/src/app.tsx`；
6. `packages/desktop/src/main/index.ts`；
7. `packages/opencode/src/server/server.ts`；
8. 一个具体 Session API 到 UI 的完整调用链。

### 准备开发 v2

1. `CONTEXT.md`；
2. `specs/v2/session.md`；
3. `packages/schema/src`；
4. `packages/core/src/session`；
5. `packages/protocol/src/groups`；
6. `packages/server/src`；
7. `packages/client/README.md`；
8. `packages/sdk-next/README.md`。

### 准备开发 TUI

1. `specs/tui-package.md`；
2. `packages/tui`；
3. `packages/cli`；
4. `packages/opencode/src/cli/cmd/tui` 的剩余兼容代码。

## 16. 开发决策清单

开始编码前先回答：

1. 这是成熟 v1 行为修复，还是 v2 新能力？
2. 用户入口是 Web、桌面、TUI，还是三者共享？
3. 是否需要新增公共 Schema 或 HTTP API？
4. Client/SDK 是否需要重新生成？
5. 是否跨越了 Schema/Core/Protocol/Server 的依赖边界？
6. 是否需要兼容旧配置、旧 SDK 或旧 Session 数据？
7. 是否涉及 Windows 原生依赖或 Workspace Junction？
8. 应在哪个包内运行测试和类型检查？

如果无法回答这些问题，先追踪一条相似功能的完整调用链，再开始修改。

## 17. 仍在演进的部分

当前源码和规格明确显示以下领域仍在迁移或设计中：

- V2 Session Runner、工具并发和崩溃恢复；
- Plugin v2 API；
- Config 再设计与旧配置转换；
- Auth、Model Database 和 Provider 插件化；
- Event V2 对外 Cursor API；
- TUI 从旧目录完全抽离；
- `sdk-next` 替代旧 SDK；
- 跨进程/集群 Session 所有权；
- 部分旧 Server 兼容层清理。

因此，规格文件描述的目标不一定已经全部实现。判断状态时以代码、测试以及规格中的 Status/TODO 为准。

## 18. 关键资料索引

- `README.zh.md`：产品简介；
- `CONTRIBUTING.md`：贡献流程；
- `AGENTS.md`：全仓库编码规则；
- `CONTEXT.md`：Session Runtime 和 Client/SDK 架构语义；
- `specs/v2/session.md`：V2 Session；
- `specs/v2/config.md`：V2 Config；
- `specs/v2/tools.md`：V2 Tool；
- `specs/v2/todo.md`：当前迁移任务；
- `specs/tui-package.md`：TUI 抽取计划；
- `packages/client/README.md`：生成客户端；
- `packages/sdk-next/README.md`：嵌入式新版 SDK；
- 各包 `README.md` 和 `AGENTS.md`：局部规则。

---

这份文档是仓库级地图，不替代每个包的局部设计文档。进行二次开发时，最可靠的方法仍然是：从用户入口开始，沿真实 Import、HTTP Contract、Effect Service 和事件流追踪到最终实现，再在正确层级修改。
