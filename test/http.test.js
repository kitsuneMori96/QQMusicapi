import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { createApp } from "../src/server.ts";

function makeStore() {
  return {
    path: "/tmp/credential.json",
    credential: { musickey: "", isLoggedIn: () => false, musicid: 0 },
    toSafeJSON: () => ({ musicid: 0 }),
    replace: async (obj) => ({ toJSON: () => obj }),
    clear: async () => {},
  };
}

function makeClient() {
  return {
    song: {
      getDetail: async (mids) => ({ tracks: mids.map((mid) => ({ mid, name: "晴天" })) }),
      getPlayUrls: async (mids, type) => ({
        [mids[0]]: { url: `http://example.test/${type.code}`, size: 3 },
      }),
      getLyrics: async () => ({ crypt: 0, lyric: "[00:00.00]晴天" }),
      getSimilar: async () => ({ vecSongNew: [] }),
      getRelatedSonglist: async () => ({ songlist: [] }),
    },
    user: {},
    search: {},
    login: { checkExpired: async () => false },
  };
}

function makeSongService() {
  return {
    resolveLyric: async () => ({
      raw: {},
      lyric: '<LyricInfo><Lyric_1 LyricContent="[ti:晴天] [0,100]晴(0,100)天(100,100)"/></LyricInfo>',
    }),
    similar: async () => ({ list: [], groups: [] }),
    prepareLyricDownload: async (_mid, kind = "lyric") => {
      if (kind === "roma") {
        const err = new Error("这首歌没有这一轨歌词");
        err.statusCode = 404;
        throw err;
      }
      const text = kind === "trans" ? "[00:00.000]Sunny\n" : "[00:00.000]晴天\n";
      const fileName = kind === "trans" ? "晴天 - 周杰伦 (翻译).lrc" : "晴天 - 周杰伦.lrc";
      return {
        buffer: Buffer.from(text, "utf8"),
        ext: ".lrc",
        fileName,
        contentDisposition: `attachment; filename="lyric.lrc"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        mime: "text/plain; charset=utf-8",
        fileSize: Buffer.byteLength(text, "utf8"),
      };
    },
    prepareDownload: async (mid, type) => ({
      buffer: Buffer.from("abc"),
      ext: "mp3",
      fileName: "晴天 - 周杰伦.mp3",
      contentDisposition: `attachment; filename="qingtian.mp3"; filename*=UTF-8''%E6%99%B4%E5%A4%A9.mp3`,
      mime: "audio/mpeg",
      fileSize: 3,
      meta: { title: "晴天", artists: ["周杰伦"] },
      tagged: true,
      mid,
      type,
    }),
  };
}

function makeShareService() {
  return {
    resolve: async (url) => {
      if (url.includes("bad")) {
        const err = new Error("分享链接解析失败");
        err.statusCode = 400;
        throw err;
      }
      return { mid: "0039MnYb0qxYhV", name: "晴天", singer: "周杰伦" };
    },
  };
}

function makeSearchService() {
  const empty = (keyword) => ({ keyword, page: 1, num: 20, total: 0, items: [] });
  return {
    searchSong: async (keyword, page = 1, num = 20) => {
      if (keyword === "无结果") return { keyword, page, num, total: 0, items: [] };
      return {
        keyword,
        page,
        num,
        total: 1003,
        items: [
          {
            mid: "0039MnYb0qxYhV",
            id: 97773,
            name: keyword,
            singer: "周杰伦",
            album: "叶惠美",
            albumMid: "000MkMni19ClKG",
            interval: 269,
          },
        ],
      };
    },
    searchAlbum: async (keyword, page = 1, num = 20) =>
      keyword === "无结果"
        ? empty(keyword)
        : {
            keyword,
            page,
            num,
            total: 598,
            items: [
              {
                mid: "000MkMni19ClKG",
                id: 8220,
                name: "叶惠美",
                singer: "周杰伦",
                songNum: 11,
                publishDate: "2003-07-31",
              },
            ],
          },
    searchSonglist: async (keyword, page = 1, num = 20) =>
      keyword === "无结果"
        ? empty(keyword)
        : {
            keyword,
            page,
            num,
            total: 489,
            items: [
              {
                id: "8231976688",
                name: "主歌单",
                creator: "kitsuneMori",
                songNum: 240,
                listenNum: 107562,
                listenNumText: "10.8万",
                cover: "",
              },
            ],
          },
  };
}

function makeCollectionService() {
  const tracks = [
    {
      mid: "003BkwkH0iS8Ko",
      id: 97781,
      name: "双刀",
      singer: "周杰伦",
      album: "叶惠美",
      albumMid: "000MkMni19ClKG",
      interval: 291,
    },
  ];
  return {
    albumDetail: async (mid, page = 1, num = 50) => ({
      mid,
      name: "叶惠美",
      singer: "周杰伦",
      publishDate: "2003-07-31",
      desc: "",
      total: 11,
      page,
      num,
      hasMore: false,
      items: tracks,
    }),
    songlistDetail: async (dissid, page = 1, num = 30) => {
      if (dissid === "404") {
        const err = new Error("歌单不存在或不可见");
        err.statusCode = 404;
        throw err;
      }
      return {
        id: dissid,
        name: "主歌单",
        creator: "kitsuneMori",
        cover: "",
        desc: "",
        total: 240,
        page,
        num,
        hasMore: true,
        items: tracks,
      };
    },
  };
}

const app = createApp({
  client: makeClient(),
  store: makeStore(),
  songService: makeSongService(),
  shareService: makeShareService(),
  searchService: makeSearchService(),
  collectionService: makeCollectionService(),
});

after(async () => {
  await app.close();
});

describe("HTTP 接口", () => {
  it("/health 返回统一信封", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.code, 0);
    assert.equal(body.message, "ok");
    assert.equal(body.data.status, "ok");
    assert.equal(typeof body.data.version, "string");
    assert.equal(body.data.loggedIn, false);
  });

  it("/song/detail 缺少 mids -> 400 且提示 query 字段", async () => {
    const res = await app.inject({ method: "GET", url: "/song/detail" });
    assert.equal(res.statusCode, 400);
    const body = res.json();
    assert.equal(body.code, 400);
    assert.match(body.message, /querystring\.mids 必填/);
  });

  it("/song/detail 正常透出 client 数据", async () => {
    const res = await app.inject({ method: "GET", url: "/song/detail?mids=0039MnYb0qxYhV" });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.code, 0);
    assert.equal(body.data.tracks[0].mid, "0039MnYb0qxYhV");
  });

  it("/song/urls 透出直链映射", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/song/urls?mids=0039MnYb0qxYhV&type=M800",
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.data["0039MnYb0qxYhV"].url, "http://example.test/M800");
  });

  it("/song/resolve 透出解析结果, 缺少 url -> 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/song/resolve?url=${encodeURIComponent("https://c6.y.qq.com/base/fcgi-bin/u?__=x")}`,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.code, 0);
    assert.equal(body.data.mid, "0039MnYb0qxYhV");

    const bad = await app.inject({
      method: "GET",
      url: `/song/resolve?url=${encodeURIComponent("https://y.qq.com/bad")}`,
    });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().message, "分享链接解析失败");

    const missing = await app.inject({ method: "GET", url: "/song/resolve" });
    assert.equal(missing.statusCode, 400);
    assert.match(missing.json().message, /querystring\.url 必填/);
  });

  it("/song/download 设置文件头并回传字节", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/song/download?mid=0039MnYb0qxYhV&type=M800",
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["content-type"], "audio/mpeg");
    assert.equal(res.headers["content-length"], "3");
    assert.match(res.headers["content-disposition"], /^attachment; filename=/);
    assert.equal(res.headers["x-tagged"], "1");
    assert.equal(res.rawPayload.toString(), "abc");
  });

  it("/vendor 命中内置 APlayer, 未知名 404", async () => {
    const ok = await app.inject({ method: "GET", url: "/vendor/APlayer.min.js" });
    assert.equal(ok.statusCode, 200);
    assert.match(ok.headers["content-type"], /javascript/);
    assert.ok(ok.rawPayload.length > 1000);

    const miss = await app.inject({ method: "GET", url: "/vendor/nope.js" });
    assert.equal(miss.statusCode, 404);
    assert.equal(miss.json().code, 404);
  });

  it("未知路由返回 JSON 404 信封", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/nope",
      headers: { accept: "application/json" },
    });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json(), { code: 404, message: "Not Found" });
  });

  it("首页返回 HTML", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers["content-type"], /text\/html/);
    assert.match(res.body, /<html/i);
  });

  it("/song/lyric 默认返回解密后的 QRC XML", async () => {
    const res = await app.inject({ method: "GET", url: "/song/lyric?mid=0039MnYb0qxYhV&decode=1" });
    assert.equal(res.statusCode, 200);
    assert.match(res.json().data.lyric, /^<LyricInfo>/);
  });

  it("/song/lyric?format=text 剥成纯 LRC", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/song/lyric?mid=0039MnYb0qxYhV&decode=1&format=text",
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.lyric, "[ti:晴天]\n[00:00.000]晴天");
  });

  it("/song/lyric 非法 format -> 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/song/lyric?mid=0039MnYb0qxYhV&format=xml",
    });
    assert.equal(res.statusCode, 400);
  });

  it("/song/lyric?download=1 回 .lrc 文件而不是 JSON 信封", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/song/lyric?mid=0039MnYb0qxYhV&download=1",
    });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers["content-type"], /^text\/plain/);
    assert.match(res.headers["content-disposition"], /^attachment;/);
    assert.equal(res.headers["x-lyric-kind"], "lyric");
    assert.equal(res.body, "[00:00.000]晴天\n");
  });

  it("/song/lyric?download=1&kind=trans 带后缀名，不占原文的配对位", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/song/lyric?mid=0039MnYb0qxYhV&download=1&kind=trans",
    });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers["content-disposition"], /filename\*=UTF-8''.*%E7%BF%BB%E8%AF%91/);
    assert.equal(res.body, "[00:00.000]Sunny\n");
  });

  it("/song/lyric?download=1 空歌词轨透出服务的 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/song/lyric?mid=0039MnYb0qxYhV&download=1&kind=roma",
    });
    assert.equal(res.statusCode, 404);
    assert.match(res.json().message, /没有这一轨/);
  });

  it("/song/lyric 非法 kind -> 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/song/lyric?mid=0039MnYb0qxYhV&kind=bass",
    });
    assert.equal(res.statusCode, 400);
  });

  it("POST /login/credential 接受额外字段并回写", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/login/credential",
      payload: { musicid: 42, musickey: "k", extra: "x" },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().data, { musicid: 42, musickey: "k", extra: "x" });
  });

  it("/login/status 读取注入的 store", async () => {
    const res = await app.inject({ method: "GET", url: "/login/status" });
    assert.equal(res.statusCode, 200);
    const d = res.json().data;
    assert.equal(d.loggedIn, false);
    assert.equal(d.file, "/tmp/credential.json");
  });

  it("/search/song 回归一化结果与分页", async () => {
    const res = await app.inject({ method: "GET", url: "/search/song?keyword=晴天&page=2&num=10" });
    assert.equal(res.statusCode, 200);
    const d = res.json().data;
    assert.equal(d.keyword, "晴天");
    assert.equal(d.page, 2);
    assert.equal(d.num, 10);
    assert.equal(d.total, 1003);
    assert.equal(d.items[0].mid, "0039MnYb0qxYhV");
    assert.equal(d.items[0].singer, "周杰伦");
  });

  it("/search/song 空关键词与越界分页都挡在 schema", async () => {
    const empty = await app.inject({ method: "GET", url: "/search/song?keyword=" });
    assert.equal(empty.statusCode, 400);
    const badPage = await app.inject({ method: "GET", url: "/search/song?keyword=晴天&page=0" });
    assert.equal(badPage.statusCode, 400);
    const tooMany = await app.inject({
      method: "GET",
      url: "/search/song?keyword=晴天&num=200",
    });
    assert.equal(tooMany.statusCode, 400);
  });

  it("/search/album 与 /search/songlist 走各自的归一化端点", async () => {
    const album = await app.inject({ method: "GET", url: "/search/album?keyword=晴天" });
    assert.equal(album.statusCode, 200);
    assert.equal(album.json().data.items[0].mid, "000MkMni19ClKG");
    assert.equal(album.json().data.items[0].songNum, 11);
    const list = await app.inject({
      method: "GET",
      url: "/search/songlist?keyword=晴天&page=2&num=10",
    });
    assert.equal(list.statusCode, 200);
    assert.equal(list.json().data.items[0].id, "8231976688");
    assert.equal(list.json().data.page, 2);
    assert.equal(list.json().data.num, 10);
  });

  it("/album/detail 回头部与曲目，失效 mid 与非法 mid 分别是 404 / 400", async () => {
    const ok = await app.inject({ method: "GET", url: "/album/detail?mid=000MkMni19ClKG" });
    assert.equal(ok.statusCode, 200);
    const d = ok.json().data;
    assert.equal(d.name, "叶惠美");
    assert.equal(d.total, 11);
    assert.equal(d.items[0].mid, "003BkwkH0iS8Ko");
    assert.equal(d.page, 1);
    assert.equal(d.num, 50);

    const bad = await app.inject({ method: "GET", url: "/album/detail?mid=短" });
    assert.equal(bad.statusCode, 400);
  });

  it("/songlist/detail 透出歌单头部，dissid 必须纯数字", async () => {
    const ok = await app.inject({
      method: "GET",
      url: "/songlist/detail?dissid=8231976688&page=2&num=30",
    });
    assert.equal(ok.statusCode, 200);
    const d = ok.json().data;
    assert.equal(d.id, "8231976688");
    assert.equal(d.creator, "kitsuneMori");
    assert.equal(d.page, 2);
    assert.equal(d.hasMore, true);

    const bad = await app.inject({ method: "GET", url: "/songlist/detail?dissid=abc" });
    assert.equal(bad.statusCode, 400);
    const missing = await app.inject({ method: "GET", url: "/songlist/detail?dissid=404" });
    assert.equal(missing.statusCode, 404);
  });
});
