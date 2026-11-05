# 专辑 / 歌单搜索与合集展开复验（2026-11-05）

真后端联调：后端 `:3399`（已登录，`node src/server.ts --port 3399`）+ `VITE_API_TARGET`
指向它的 `vite dev :5274`，Chromium 实渲染，非路由桩。脚本是临时的，这里只留证据截图。

| 截图 | 场景 | 实测结论 |
| --- | --- | --- |
| `p1-album-tab.png` | 深链 `?q=叶惠美&type=album` | 页签落在「专辑」，表头 `46 条`，20 行（曲名 / 歌手 / 曲目数 / 发行日期），分页 `1 / 3`；地址栏带 `type=album` |
| `p2-album-open.png` | 深链 `?album=000MkMni19ClKG` | 合集卡独立展开：封面、`叶惠美`、`周杰伦 · 2003-07-31`、简介三行截断、`11 首`、11 行曲目（序号 / 曲名 / 歌手 / 专辑 / 时长）；11 首一页装完，没有「加载更多」 |
| `p3-track-parsed.png` | 点专辑第 01 首「双刀」 | 曲目点下去走原解析链：URL 变成 `?album=…&mid=003BkwkH0iS8Ko`（`album` 保留），下方出曲目卡与首选音质；该首 SQ 不可取，按阶梯落到 `OGG 640` |
| `p4-songlist.png` | `?q=周杰伦&type=songlist` 点第一条 | 搜索卡 `299 条`、分页 `1 / 15`；合集卡 `99 首`、首批 30 行、作者 `今晚月色很美`、封面来自上游 `picurl`；URL 变 `?q=…&type=songlist&dissid=7039749142` |
| `p5-load-more.png` | 点「加载更多」 | 30 → 60 行追加，列表不换页；总数 99，按钮继续在 |

全程 console 与 pageerror 均为 0（一次重试用例除外，见下）。

## 端点侧证据（curl，同一后端）

```
GET /search/album?keyword=叶惠美&page=1&num=3
{"total":46,"items":[{"mid":"000MkMni19ClKG","id":8220,"name":"叶惠美","singer":"周杰伦",
  "songNum":11,"publishDate":"2003-07-31"}, ...]}

GET /search/songlist?keyword=周杰伦&page=1&num=3
{"total":299,"items":[{"id":"7039749142","name":"百听不厌的周杰伦","creator":"今晚月色很美",
  "songNum":99,"listenNum":417638577,"listenNumText":"4.2亿","cover":"http://qpic…/300?n=1"}, ...]}

GET /album/detail?mid=000MkMni19ClKG&page=1&num=3
{"mid":"000MkMni19ClKG","name":"叶惠美","singer":"周杰伦","publishDate":"2003-07-31","total":11,
 "page":1,"num":3,"hasMore":true,"items":[{"mid":"003BkwkH0iS8Ko","name":"双刀",…}]}

GET /songlist/detail?dissid=7039749142&page=1&num=3
{"id":"7039749142","name":"百听不厌的周杰伦","creator":"今晚月色很美","total":99,
 "hasMore":true,"items":[{"mid":"000pKyAo4eXXG4","name":"晴天",…}]}

GET /album/detail?mid=000000000000000    → 404 专辑不存在
GET /songlist/detail?dissid=999999999999 → 404 歌单不存在或不可见
GET /album/detail?mid=短                 → 400（schema: 6–30 位字母数字）
GET /songlist/detail?dissid=abc          → 400（schema: 纯数字）
```

三处上游形态在真实响应里再次确认：专辑条目身份是 **小写 `albummid`**，详情参数却叫 `albumMid`；
歌单身份是**字符串 `dissid`**，`CgiGetDiss` 必须收数字（字符串会回 `-100008` 参数错误）；
专辑曲目埋一层 `songInfo`，歌单曲目与搜歌结果同形。

## 过程中的两个真实情况

- **上游搜索限流**：连续多轮探测后 `/search/*` 回 `429`（`code 2001 请求被限流`），
  冷却约 1–2 分钟后恢复。复验脚本因此改成「详情接口先行 + 搜索请求间隔 10s + 429 退避重试」，
  最终一轮一次通过。这是上游行为，不是本地缺陷。
- **一次瞬时的详情失败**：首轮点击「双刀」时 `/song/detail` 偶发失败，曲目卡显示
  `详情获取失败`，但直链探测照常完成；同一 mid 立即重试就正常（`p3`）。稀有 track 详情
  偶发失败属于上游抖动，前端原本就有错误态兜底，未做额外处理。

## 顺手补的 dev 代理

`web/vite.config.ts` 的代理白名单加了 `/album` 与 `/songlist`——和生产同源托管不同，
开发态不代理这两个前缀会落到 SPA 路由回 HTML（与上次 `/search` 是同一类问题）。

## 门禁

根 `tsc --noEmit` 干净；`npm test` 104 通过；`vue-tsc` 干净；`vitest` 142 通过；
`web build` 成功；`playwright` 全绿（含新增的 4 条合集用例）。
