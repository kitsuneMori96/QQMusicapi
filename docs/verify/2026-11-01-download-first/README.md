# 下载优先改造复验（2026-11-01）

真后端联调：后端 `:3300`（已登录）+ `vite dev :5273` 代理，Chromium 实渲染，非路由桩。
断言脚本是临时的（`/tmp/real-verify.mjs`），这里只留证据截图。
HEAD = `bbfe551`；`typecheck` / `vitest 114` / `build` / `playwright 13` 全绿。

| 截图 | 场景 | 实测结论 |
| --- | --- | --- |
| `s1-first-screen.png` | 粘贴 songmid | `/song/urls` 恰 1 次且 `type=F000`（改造前 17 次），主按钮 `↓ 下载 SQ 无损`，1.5s 内 `/song/download` 0 次——解析不自动落盘 |
| `s1b-download-bar-done.png` | 点一次主按钮 | 浏览器保存名 `晴天 - 周杰伦.flac` 来自后端 `Content-Disposition`，下载条同步显示「已保存」+ 同名 |
| `s2-share-link.png` | 粘贴 c6 分享短链 | 先 `/song/resolve` 1 次换成 songmid（该短链现指向 `001oLCc52Wo0s8`），随后仍只探 1 档 |
| `s3-fallback.png` | 拦截 F000 使其失败 | 副标题 `「SQ 无损」不可取，已切到「OGG 640」`，主按钮跟随降级档 |
| `s4-others-expanded.png` | 展开「其他音质」 | 折叠前 1 档、展开后共 17 档，计数 `17 / 17 已探测` |
| `s5-auth-expired.png` | 下载返回 401(104401) | 由**下载失败**触发 sticky「登录状态已失效 + 去登录」，全程只 1 条；任务行标失败并可重试（修前的缺陷：裸 fetch 绕过 401 守卫） |
| `s6-preferred-persist.png` | 改首选音质为 MP3 128 | 写入 `localStorage qqm.v1.preferredQuality`，reload 后选择器仍是该档且首屏只发 `type=M500` |

`bbfe551` 修的是 S6 暴露的闪烁：切换首选音质时 `preferred` 先改、新档还在探测，
主按钮会短暂显示「首选音质不可用」。修复后探测窗口内文案为「探测首选音质…」
且选择器禁用；同一动作（F000 → M500）每 50ms 采样一次：修复前 `t=9ms` 读到
「首选音质不可用」+ 红色副标题「首选与降级阶梯均不可用」，`t=115ms` 才落回
「↓ 下载 MP3 128」；修复后 `t=8ms` 即为「探测首选音质…」、`t=125ms` 落位。

## 增量复验：解析即装载（HEAD `083b332`）

同一套栈（后端 `:3300` + `vite :5273` + Chromium 实渲染），25 条断言 21 通过。
读状态的方式记一下，免得后人再踩：APlayer 的 `audio` 元素**从不挂进 DOM**
（`initAudio` 只 `document.createElement`），所以 `document.querySelector('.aplayer audio')`
恒为 null；要用 `addInitScript` 劫持 `document.createElement('audio')` 拿到真实元素。
播放/暂停图标也不共存切换 class，而是 `.aplayer-play` / `.aplayer-pause` 两个元素靠 inline display 互斥。

| 截图 | 断言 | 实测 |
| --- | --- | --- |
| `p1-loaded-silent.png` | 解析成功即装载且不出声 | 标题 `晴天 [SQ 无损]`、`audio.paused=true`、`currentTime=0`、播放键可见、状态栏「待播 SQ 无损」、`/song/download` 0 次 |
| `p2-inline-lyric-similar.png` | 歌词/相似不再折叠 | 全页只剩 1 个 `<details>`（其他音质），歌词 63 行、相似 15 项直接内联可见 |
| `p3-actually-playing.png` | 点播放器播放键 | `paused` 转 false、图标翻成暂停键、向 CDN 取流；**状态栏仍写「待播」**（缺陷，见下） |
| `p5-row-play.png` | 展开后行内播放 | 可播 10 行；点 OGG 320 → `paused=false`、标题切 `晴天 [OGG 320]`、行内按钮变「正在播放/已暂停」 |
| `p7-switch-song.png` | 换歌 | 点相似曲目 → 播放器跟随换成 `起风了 [SQ 无损]`，且新曲仍是装载态不出声 |

歌词点击 seek 单独定点验过：点第 4 行 → `audio.currentTime=6.75` 并自动起播，
当前行高亮 `.lyric__line--active` 命中 1 个，说明 `seekRequest` 链路是通的。

### 本机验不了的部分（环境限制，不是代码缺陷）

这台 WSL 没有音频输出设备（`/dev/snd` 不存在、`pulseaudio` 未运行、`/mnt/wslg/PulseServer`
无进程），Chromium 因此**不推进播放时钟**：对照实验里连本地生成的 WAV 数据 URL
在 headless 与 headed 下 `currentTime` 都恒为 0。所以「听得到在放」这条只能由人耳验收，
脚本只能验到 `paused=false` + `readyState>=1` + 取流请求发生。

顺带一个观察：SQ 无损装载后 `preload=auto` 会立刻向 CDN 拉流，但 30s 内
`buffered.end` 一直停在 ~16.6s（`Content-Range` 是 206 分段），首帧前 10–15s
`readyState` 只到 1。用户侧表现为「按下后要等一下才动」。

### 两条缺陷与处置

1. **状态栏文案与播放器自带按钮不同步**：`nowLabel` 只在 `play()/load()/clear()` 里改写，
   用户按 APlayer 自己的播放键走的是 audio 事件 → `setPlaying(true)`，
   于是「正在放」与「待播 SQ 无损」并存。
   处置（已达成一致）：`▶` 保留给「用户显式点行内播放」那一刻，
   按播放器自带按钮起播沿用装载时的档位文案，但暂停要显示「已暂停」而不是继续显示「待播」。
2. **`.nac` 容器不该给播放键**：`TL01 / AICodec` 探测状态是 `OK`（直链有效，
   `Content-Type: application/octet-stream`），行内播放键可点，但 Chromium 解码不了
   → `error.code=4 (MEDIA_ERR_SRC_NOT_SUPPORTED)`，播放器只能回一句
   「音频加载失败，直链可能已过期，请重新解析后播放」——文案把容器不支持误导成直链过期。
   `AI00 / Q00x / D004 / DT03` 这批探测直接 FAIL，不会走到这一步。
   处置：`QualityGrid` 里加 `isPlayableUrl`（按扩展名 + 排除 hires 整组），
   `TL01` 这类行只留下载；`PlayerBar` 的直链过期文案改为「直链可能已过期或该容器浏览器不支持」。
