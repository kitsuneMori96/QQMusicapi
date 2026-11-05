# 关键词搜歌复验（2026-11-05）

真后端联调：后端 `:3399`（已登录，`node src/server.ts --port 3399`）+ `VITE_API_TARGET`
指向它的 `vite dev :5274`，Chromium 实渲染，非路由桩。脚本是临时的，这里只留证据截图。
HEAD = `4614af8`（搜索改动尚未提交）；根 `tsc` / `npm test 86` / `vue-tsc` / `vitest 130` /
`web build` / `playwright` 全绿。

| 截图 | 场景 | 实测结论 |
| --- | --- | --- |
| `p1-search-list.png` | 输入「晴天」回车 | 按钮文案变「搜索」，meta 行显示 `关键词: 晴天`；结果卡表头 `搜索 「晴天」 1003 首`，20 行齐（序号 / 曲名 / 歌手 / 专辑 / 时长），分页 `1 / 51` |
| `p2-picked-parse.png` | 点第 01 行 | 输入框被填成 `0039MnYb0qxYhV`，该行高亮为 active 且不可重复点；下方照常出曲目卡、下载按钮、播放器——搜索与解析是同页衔接，不跳路由 |
| `p3-page2.png` | 深链 `?q=和平音` 后点「下一页」 | 地址栏仍是 `?q=和平音`（页码只活在 store 里，刷新回第 1 页），分页 `2 / 51`，首行序号 `21`——行号接着上一页排 |
| `p4-empty.png` | 输入一串无意义中文 | 上游照样模糊返回 20 条，`没搜到「…」` 分支在真后端几乎撞不到，只在桩测里覆盖 |
| `p5-ascii-looks-like-mid.png` | 输入 `zzzqqxnotfound99887`（19 位纯字母数字） | 判成 mid，按钮回到「解析」——见下「一条边界」 |

全程 4 次 `/search/` 请求，console 与 pageerror 均为 0。

## 端点侧证据（curl，同一后端）

```
GET /search/song?keyword=晴天&page=1&num=5
{"code":0,"data":{"keyword":"晴天","page":1,"num":5,"total":1003,"items":[
  {"mid":"0039MnYb0qxYhV","id":97773,"name":"晴天","singer":"周杰伦",
   "album":"叶惠美","albumMid":"000MkMni19ClKG","interval":269}, ...]}}

page=2&num=3 → page 2 首行与 page=1&num=5 的第 4 条同人同曲（上游按 num 切页，页码与条数自洽）
keyword=      → 400
num=200       → 400（schema 上限 30）
```

三处上游形态在真实响应里确认：`item_song` 是**以下标为键的对象**而非数组；`title_main` 带
`<em>` 高亮标签（归一化后 `name` 干净）；分页信息全在 `data.meta`（`curpage` / `perpage` /
`sum`），`body` 里没有。多歌手用 `、` 连接（`清塚信也、高橋直之`）。

## 复验顺手抓到的一处真缺陷

`web/vite.config.ts` 的 dev 代理白名单原本只有 `/health` `/song` `/user` `/vendor`，
**没有 `/search`**——生产环境前端由后端同源托管所以没事，但开发态关键词搜索会被 vite
当成 SPA 路由回一份 HTML。已把 `/search` 加进代理列表（e2e 用 `page.route` 打桩，撞不到这条）。

## 一条边界，别当成 bug

「mid 与关键词天然不混淆」在中文歌名上成立，但有一段窄区间不成立：**10–20 位纯 ASCII
字母数字**的输入会被 `extractMid` 判成 mid（`p5`）。实际关键词极少长这样——英文歌名要么
带空格要么不足 10 位——所以维持「链接/mid 永远优先」不分流，不做额外猜测。
