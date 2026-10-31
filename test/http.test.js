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

const app = createApp({
  client: makeClient(),
  store: makeStore(),
  songService: makeSongService(),
  shareService: makeShareService(),
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
});
