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
