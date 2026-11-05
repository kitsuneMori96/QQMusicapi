# 单独下载 .lrc 歌词复验（2026-11-05）

真后端联调：后端 `:3399`（已登录，`node src/server.ts --port 3399`）+ `VITE_API_TARGET`
指向它的 `vite dev :5274`，Chromium 实渲染，非路由桩。脚本是临时的
（`/tmp/lrc-archive-check.mjs`），这里只留证据截图。
HEAD = `99af2ad`；根 `typecheck` / `vitest 122` / `web build` / `playwright 17` 全绿。

| 截图 | 场景 | 实测结论 |
| --- | --- | --- |
| `p1-lyric-card.png` | 深链 `?mid=0039MnYb0qxYhV` 解析完 | 歌词卡右上角出现「下载 .lrc」且 enabled，页签为 原文 / 翻译(灰) / 罗马音(灰)，计数 `1 轨` |
| `p2-saved-notice.png` | 点一次按钮 | 浏览器 `download` 事件给出 `晴天 - 周杰伦.lrc`（名来自后端 `Content-Disposition`），通知条 `ok 歌词已下载` + 同名 detail，全程无 console error |
| `p3-lyric-card-closeup.png` | 落盘内容 | 2610 字节 / 69 行，首三行 `[ti:晴天]` `[ar:周杰伦]` `[al:叶惠美]`，逐字时间标记 `<NNNN:` 命中 0 次——存出的就是页面上那份整行版 |

## 端点侧证据（curl，同一后端）

```
GET /song/lyric?mid=0039MnYb0qxYhV&decode=1&kind=lyric&download=1
200  content-type: text/plain; charset=utf-8
     content-length: 2610
     content-disposition: attachment; filename="__ - ___.lrc"; filename*=UTF-8''%E6%99%B4%E5%A4%A9%20-%20%E5%91%A8%E6%9D%B0%E4%BC%A6.lrc
     x-lyric-kind: lyric
```

`kind=roma` / `kind=trans`（晴天没有这两轨）回 `404 {"code":404,"message":"这首歌没有这一轨歌词","data":{...}}`，
不落文件；前端此时按钮本就该是禁用的，404 只在页面数据过期时才可能撞到。

## 记两条已知事实，免得被当成新缺陷

- ASCII 回退名是 `__ - ___.lrc`：`asciiFallback` 把非 ASCII 一律折成下划线，这是
  `/song/download` 一直以来的行为，浏览器取的是 `filename*`，中文显示正常。
- 「罗马音」页签此前永远灰：JSON 分支没往 `resolveLyric` 传 `roma`，上游就不给那一轨。
  本次顺手修掉（`src/routes/song.ts` 里显式 `roma: true`）。晴天本身无罗马音，所以
  截图里它仍是灰的——点亮与否取决于上游是否真有该轨，不由前端决定。
