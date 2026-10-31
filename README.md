# QQMusic API for Node.js

> **注意**：本项目仅用于技术研究与学习，请勿用于侵犯版权或其他商业用途，请支持正版音乐。

## ✨ 特性

- **核心客户端** `Client`：封装 HTTP 请求、User-Agent、Cookie、Session、QIMEI 设备指纹
- **请求描述符** `Request`：实现 thenable，可直接 `await`，也支持 `gather` 批量并发
- **签名算法**：`zzc_sign` 签名、自定义 TripleDES 加解密、QRC 歌词解密
- **业务模块**：`search` / `song` / `user` / `login`
- **Fastify Web 服务**：REST API + Vue 3 前端（解析页 + 登录管理页），生产环境由同一端口托管
- **共享契约** `src/contracts`：TypeBox schema 同时承担请求校验与前端类型，前后端字段不再靠猜
- **APlayer 播放器**：本地托管 [APlayer](https://aplayer.js.org/)，支持 17 种音质在线试听（不依赖 jsdelivr）
- **多平台支持**：Android / Desktop / Web 三种平台版本策略

## 📦 安装

```bash
cd QQMusicapi
npm install
```

要求 Node.js >= 22.18（后端入口是原生 TypeScript，依赖 Node 的类型擦除，无需构建步骤）。

## 🚀 快速开始

### 启动 Web 服务

```bash
# 默认监听 0.0.0.0:3300
npm start

# 开发模式（文件变更自动重启）
npm run dev

# 开发模式并自动打开浏览器
npm run dev:open

# 命令行参数
node src/server.ts --port 3000 --host 127.0.0.1 --platform web

# 查看全部启动参数
npm run help
```

配置优先级：**命令行参数 > 进程环境变量 > `.env` 文件 > 默认值**。
复制 `.env.example` 为 `.env` 即可固定本地配置。服务默认绑定 `0.0.0.0`，局域网/容器场景可直接访问；`SIGINT`/`SIGTERM` 触发优雅退出（最长等待 10s）。

启动后访问：

- **首页解析器**：[http://localhost:3300/](http://localhost:3300/) — 粘贴歌曲链接或 songmid，一键获取 17 种音质直链、歌词、相似歌曲，并使用 APlayer 在线试听
- **登录管理**：[http://localhost:3300/login](http://localhost:3300/login) — 支持 QQ 二维码登录与手机验证码登录，查看当前用户信息

### 启动配置一览

| 参数 | 环境变量 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `-p, --port` | `PORT` | `3300` | 监听端口 |
| `-H, --host` | `HOST` | `0.0.0.0` | 监听地址 |
| `--platform` | `PLATFORM` | `android` | 请求平台：`android` / `desktop` / `web` |
| `--device` | `DEVICE_PATH` | `./device.json` | 设备信息持久化路径 |
| `--credential` | `CREDENTIAL_PATH` | `./credential.json` | 凭证持久化路径 |
| `--open` | `OPEN_BROWSER` | 关闭 | 启动后尝试打开浏览器 |
| - | `QQMUSIC_DEBUG` | - | 设为 `1` 时输出 check_sig 等调试日志 |

### 开发者模式

功能开发时让服务在文件变更后自动重启：

```bash
npm run dev          # node --watch，改代码即重启
npm run dev:open     # 同上，并在启动时打开浏览器
```

前台运行时 `Ctrl+C` 优雅退出。调试签名等细节可设 `QQMUSIC_DEBUG=1 npm run dev`。

### 前端开发（web/）

前端是独立的 Vue 3 + Vite 工程，开发时与后端分开跑：

```bash
# 1. 起后端（默认 3300）
npm run dev

# 2. 另开终端起前端（默认 5273，/api 与 /song 等请求代理到 3300）
cd web && npm install && npm run dev
```

- 代理目标可用 `VITE_API_TARGET` 覆盖（见 `web/vite.config.ts`）
- `npm run typecheck`（vue-tsc）、`npm test`（Vitest）、`npm run test:e2e`（Playwright）
- 构建产物 `web/dist`：`npm run build:web`（根目录执行）。存在时后端直接托管它，`/` 与 `/login` 都回 SPA 的 `index.html`，深链可刷新；不存在时回退旧的 `src/public` 静态页
- 接口类型统一从 `src/contracts` 以 `import type` 引入，请求参数以后端 TypeBox schema 为准

### qqm 管理脚本

`bin/qqm` 是随仓库分发的通用启动管理脚本：把服务作为后台常驻进程管理，pid 与日志存放在 `$XDG_RUNTIME_DIR/qqm/<项目目录名>/`，不会污染项目目录。

```bash
# 安装到 PATH（软链即可；脚本按真实路径定位仓库，移到别处也能解析到本项目）
ln -sf "$(pwd)/bin/qqm" ~/.local/bin/qqm
```

```bash
qqm                    # 后台启动并等待端口就绪（若已运行则提示）
qqm start -- --port 3400   # 启动，`--` 后参数透传给应用入口
qqm stop               # 优雅停止（SIGTERM，12s 超时后强杀）
qqm restart            # 重启；restart -- <参数> 同 start
qqm status             # 进程状态 + 监听地址 + /health 探测
qqm logs               # 查看最近 50 行日志
qqm logs -f            # 实时跟随日志
qqm logs 200           # 查看最近 200 行
qqm fg                 # 前台运行（Ctrl+C 退出），适合临时调试
qqm where              # 打印解析后的项目 / 入口 / 运行目录
qqm help               # 用法说明
```

通用性来源：项目根目录按脚本真实位置推导，入口从 `package.json` 的 `main` 读取，运行目录按项目名隔离，监听地址从启动日志解析后做 `/health` 探测。换仓库或改名都不需要改脚本。

环境变量：`QQM_PROJECT` 覆盖项目路径（默认脚本所在仓库），`QQM_RUNTIME` 覆盖 pid/日志根目录。

> 注意：`qqm` 与 `npm run dev` 都监听同一端口，切换前先停掉另一个，避免 `EADDRINUSE`。

### 常驻部署

```bash
# Docker
docker build -t qqmusic-api .
docker run -d -p 3300:3300 --name qqmusic-api qqmusic-api

# pm2
pm2 start ecosystem.config.cjs
pm2 save
```


## 🌐 Web API

### 通用约定

- 所有响应均为 JSON，格式：`{ code, message, data, meta? }`
- `code === 0` 表示成功，非零表示失败
- POST 请求使用 `application/json` body
- 请求参数由 Fastify + TypeBox schema 校验，缺失/类型错误返回 `400`，`message` 会指明字段（如 `参数校验失败: querystring.mids 必填`）
- 请求/响应类型定义与校验 schema 在 `src/contracts/`，前端以 `import type` 复用

### 路由列表

#### 基础

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/` | GET | 首页 Web UI（歌曲解析器） |
| `/login` | GET | 登录管理 Web UI |
| `/health` | GET | 健康检查 |

#### 搜索 `/search`

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/search/hotkey` | GET | 热搜词 |
| `/search/complete?keyword=...` | GET | 搜索补全 |
| `/search/quick?keyword=...` | GET | 快速搜索 |
| `/search/general` | POST | 综合搜索 |
| `/search/byType` | POST | 按类型搜索 |

#### 歌曲 `/song`

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/song/detail?mids=a,b` | GET | 歌曲详情 |
| `/song/urls?mids=a,b&type=MP3_128` | GET | 播放直链（支持 17 种音质） |
| `/song/lyric?mid=...&decode=1` | GET | 歌词（自动 QRC 解密） |
| `/song/similar?songid=...` | GET | 相似歌曲 |
| `/song/relatedSonglist?mid=...` | GET | 相关歌单 |
| `/song/download?mid=...&type=M800` | GET | 下载音频文件（按元数据命名并内嵌标签） |

##### `GET /song/download`

服务端代拉 CDN 字节并回给浏览器保存，替代直接下载 CDN 原始名（`M800<mid><mid>.mp3`）：

- 文件名 `<标题> - <歌手>.<ext>`，多歌手以 `、` 连接，过滤 Windows 非法字符；响应头同时给出 ASCII 回退 `filename=` 与 UTF-8 `filename*=`（中文在浏览器里正常显示）
- `mp3` / `flac` 内嵌标题、歌手、专辑、年份、封面（Front Cover）与歌词（QRC 自动解密并剥掉逐字时间标记，还原为普通 LRC）；`m4a` / `ogg` / `mp4` / `nac` 仅重命名，不改字节
- `type` 接受音质代码（`M800`）或枚举名（`MP3_320`），默认 `MP3_320`
- 响应头附带 `X-Song-Title` / `X-Song-Artist`（URL 编码）与 `X-Tagged: 1|0` 表示是否已写标签
- 无版权 / 需要 VIP 时返回对应 JSON 错误信封（VIP 为 HTTP 403），不会给出半截文件

#### 用户 `/user`

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/user/self` | GET | 当前登录用户信息 |
| `/user/info?uin=...` | GET | 指定用户信息 |
| `/user/songlist?uin=...&page=1&num=30` | GET | 用户歌单 |
| `/user/follows?uin=...&page=1&num=30` | GET | 关注列表 |
| `/user/fans?uin=...&page=1&num=30` | GET | 粉丝列表 |
| `/user/follow` | POST | 关注 / 取消关注 |

#### 登录 `/login`

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/login/status` | GET | 凭证状态 |
| `/login/credential` | GET | 查看凭证（脱敏） |
| `/login/credential` | PUT | 替换凭证 |
| `/login/credential` | DELETE | 清空凭证 |
| `/login/refresh` | POST | 刷新凭证 |
| `/login/logout` | POST | 登出 |
| `/login/qrcode` | POST | 获取 QQ 登录二维码 |
| `/login/checkQrcode` | POST | 检查二维码状态 |
| `/login/sendAuthcode` | POST | 发送手机验证码 |
| `/login/phone` | POST | 手机验证码登录 |

### 支持的音质

`/song/urls` 与 `/song/download` 接口的 `type` 参数支持以下 17 种音质（也可传枚举名，如 `MP3_320`）：

| 代码 | 说明 |
| --- | --- |
| `DT03` | DTS:X |
| `AI00` | 臻品母带 |
| `Q000` | 臻品音质 |
| `Q001` | 臻品全景声 5.1 |
| `Q003` | 臻品全景声 7.1 |
| `D004` | 杜比全景声 |
| `TL01` | AICodec |
| `F000` | SQ 无损 |
| `O801` | OGG 640 |
| `O800` | OGG 320 |
| `O600` | OGG 192 |
| `O400` | OGG 96 |
| `M800` | MP3 320 |
| `M500` | MP3 128 |
| `C600` | ACC 192 |
| `C400` | ACC 96 |
| `C200` | ACC 48 |

## 🖥️ Web UI

### 首页解析器 (`/`)

- 粘贴歌曲链接或 songmid 即可一键解析
- 展示歌曲信息、封面、专辑、歌手
- 并发获取 17 种音质直链，显示可用 / 不可用状态
- 「下载」按钮走 `GET /song/download`，浏览器直接保存为 `标题 - 歌手.mp3/.flac` 并内嵌封面与歌词
- 集成 [APlayer](https://aplayer.js.org/) 播放器，支持歌曲名称、歌手、封面、播放链接展示
- 歌词多版本切换（原文 / 翻译 / 罗马音）
- 相似歌曲推荐，点击即可跳转解析

### 登录管理 (`/login`)

- **当前登录状态**：展示登录态、musicid、凭证过期标志、凭证文件路径
- **当前用户信息**：头像、昵称
- **QQ 二维码登录**：实时轮询扫码状态（SCAN / CONF / DONE / REFUSE / TIMEOUT）
- **手机验证码登录**：发送验证码（60s 倒计时）并登录
- **凭证管理**：刷新凭证、退出登录

## 📁 项目结构

```
src/
├── algorithms/          # 签名与加解密算法
│   ├── sign.js          # zzc_sign 签名
│   ├── tripledes.js     # TripleDES 加解密
│   └── qrc.js           # QRC 歌词解密
├── contracts/           # 接口契约 (TypeScript 类型 + TypeBox schema)
│   ├── index.ts         # 统一出口 (前端 import type 这里)
│   ├── common.ts        # 响应信封
│   ├── health.ts        # /health
│   ├── song.ts          # 歌曲数据结构
│   ├── login.ts         # 登录/凭证结构
│   ├── search.ts        # 搜索类型枚举与结构
│   ├── user.ts          # 用户结构
│   └── schemas.ts       # 请求参数 schema + 推导类型
├── http/                # HTTP 层通用件
│   ├── responses.ts     # ok()/fail() 响应信封
│   └── errorHandler.ts  # 异常 -> 状态码/JSON, schema 错误格式化
├── models/              # 数据模型
│   ├── credential.js    # 登录凭证
│   └── request.js       # 请求描述符 (thenable)
├── modules/             # 业务模块 (API 请求构造)
│   ├── base.js          # 模块基类
│   ├── search.js        # 搜索
│   ├── song.js          # 歌曲
│   ├── song_filetype.js # 音质类型 (resolveSongFileType/extForCode)
│   ├── user.js          # 用户
│   └── login.js         # 登录
├── routes/              # Fastify 路由 (按业务域拆分, .ts)
│   ├── index.ts         # mountAll() 统一挂载
│   ├── search.ts        # /search
│   ├── song.ts          # /song (含 /song/download)
│   ├── user.ts          # /user
│   └── login.ts         # /login
├── services/            # 编排层 (组合模块 API + 后处理)
│   ├── songService.js   # 歌词解码/详情归一化/封面抓取/下载准备
│   └── tagWriter.js     # mp3/flac 标签与封面写入
├── store/
│   └── credentialStore.js # 凭证文件存储 (Client 单一凭证来源)
├── public/              # 旧版 Web UI (web/dist 不存在时的回退) + 内置 APlayer
│   ├── index.html       # 首页解析器 (旧版)
│   ├── login.html       # 登录管理页 (旧版)
│   └── vendor/          # 本地托管的 APlayer 资源
├── utils/               # 工具
│   ├── common.js        # 通用工具
│   ├── device.js        # 设备指纹管理
│   ├── filename.js      # 下载文件名/Content-Disposition/MIME
│   └── qimei.js         # QIMEI 注册
├── client.js            # 核心客户端
├── config.js            # 启动配置 (CLI > env > .env > 默认)
├── exceptions.js        # 异常定义
├── server.ts            # Fastify 服务入口 (装配 + 启动 + 静态托管)
├── version.js           # 版本号 (透出到 /health)
└── versioning.js        # 平台版本策略
web/                     # Vue 3 + Vite 前端 (解析页 / 登录页 / Pinia / APlayer)
bin/qqm                  # 通用启动管理脚本 (后台常驻 / 日志 / 健康探测)
test/                    # node:test 单元/集成测试 (npm test)
.github/workflows/       # CI: 后端 typecheck + 测试, 前端 typecheck + 测试 + 构建
```
