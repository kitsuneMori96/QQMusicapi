# web/ — QQMusic 解析终端前端

Vue 3 + Vite + TypeScript + vue-router + Pinia。无 UI 组件库、无图表库、不 SSR。

## 启动

```bash
cd web
npm install
npm run dev        # http://127.0.0.1:5273
```

开发态由 Vite 代理到后端（默认 `http://127.0.0.1:3300`，即项目默认端口）：

```bash
VITE_API_TARGET=http://127.0.0.1:3300 npm run dev
```

代理路径：`/health`、`/song/*`、`/user/*`、`/vendor/*`，以及 `/login/status|qrcode|checkQrcode|phone|sendAuthcode|refresh|logout`。

> 为什么不是整个 `/login`：`/login` 同时是 SPA 路由，整段代理会让开发态打不开登录页。

## 脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | Vite 开发服务器（端口 5273，被占用会直接报错） |
| `npm run build` | `vue-tsc --noEmit` + 生产构建到 `web/dist` |
| `npm run typecheck` | 仅类型检查 |
| `npm test` | Vitest（`src/**/*.spec.ts`） |
| `npm run test:e2e` | Playwright（`e2e/*.spec.ts`，首次需 `npx playwright install chromium`） |

## 目录

```
web/
├─ index.html
├─ vite.config.ts          # proxy / fs.allow(../src/contracts) / 端口
├─ vitest.config.ts
├─ playwright.config.ts
├─ src/
│  ├─ main.ts              # 挂载 + 全局异常可见化
│  ├─ App.vue
│  ├─ router/index.ts      # / 解析页, /login 登录页, 其余回落 /
│  ├─ styles/
│  │  ├─ tokens.css        # 颜色/字号/间距全部令牌化
│  │  └─ terminal.css      # panel/label/btn/input/tag 等原语
│  ├─ api/
│  │  ├─ http.ts           # {code,message,data} 信封 + 超时
│  │  ├─ health.ts         # /health
│  │  ├─ song.ts           # detail / urls / lyric / similar / download
│  │  ├─ login.ts          # status / qrcode / checkQrcode / 手机登录 / 凭证
│  │  └─ contracts.ts      # 唯一出口，import type 自根 src/contracts
│  ├─ lib/
│  │  ├─ mid.ts            # songmid 提取 / 封面 / 时长
│  │  └─ qualities.ts      # 17 种音质目录
│  ├─ stores/              # status / notice / parse / player / login
│  ├─ components/          # AppShell StatusBar ErrorBar SongHeader
│  │                       # QualityGrid LyricPanel SimilarList PlayerBar UserCard
│  └─ views/               # ParseView LoginView
└─ e2e/shell.spec.ts
```

## 视觉规范（OSM 数据终端风）

- 底 `#0d0f11`、面板 `#121518`、发丝线 `#2a2f36`、圆角 0–2px、无阴影、无悬浮动画
- 等宽字体栈，无外链字体（用户网络无法访问 CDN）；首选 JetBrains Mono / IBM Plex Mono，回落到系统等宽
- 10–11px 大写宽字距微标签，13px 正文
- 强调色：蓝 `#5b9dff` / 绿 `#3ecf8e` / 琥珀 `#f2c14e` / 紫 `#a78bfa`
- 组件内不硬编码色值，一律用 `tokens.css` 变量

## 当前状态

已就位：外壳、状态栏（`/health` 探测）、解析页（详情 / 17 音质直链并发探测 / 歌词（`format=text` 纯 LRC）/ 相似曲目 / 服务端代理下载 / APlayer 播放）、登录页（会话状态、二维码 2s 轮询状态机、手机验证码与倒计时、用户卡、凭证刷新/退出）、APlayer 本地托管与暗色适配及失败降级、Vitest 37 例、Playwright 8 例。

已与 3301 真实上游联调：晴天 11/17 档可用、68 行 LRC 无空行、15 条相似、播放器正常挂载、控制台无报错。

APlayer 走 `/vendor/APlayer.min.js|css`（本地托管，严禁改回 jsdelivr）。
