# 分享链接由后端跟随跳转解析为 songmid

用户从 QQ / 微信转发的分享链接（`c6.y.qq.com/base/fcgi-bin/u?__=…` 一类短链）本身不含 songmid，解析必须由后端 `GET /song/resolve?url=` 完成：手动跟随 302、只允许 `y.qq.com` 及其子域、限 4 跳且每跳 8s 超时，落到 `playsong.html` 这类只带数字 songid 的页面时再用 `song.getDetail` 换成 songmid。

我们放弃了解析分享页 HTML 这条看起来更省事的路：页面结构随上游改版随时会变，而跳转链是对外承诺的接口形态，比 DOM 稳定得多。域名白名单同时是刻意设计——不这样做，这个接口就会变成任意 URL 代理。
