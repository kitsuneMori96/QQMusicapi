import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ShareService, extractSongRef, isAllowedShareHost } from "../src/services/shareService.js";

const SHORT = "https://c6.y.qq.com/base/fcgi-bin/u?__=rhEMMiIFAphR";

function fakeClient(track = { mid: "0039MnYb0qxYhV", id: 1761698, name: "晴天", singer: [{ name: "周杰伦" }] }) {
  const calls = [];
  return {
    calls,
    song: {
      async getDetail(mids) {
        calls.push(mids);
        return { tracks: track ? [track] : [] };
      },
    },
  };
}

function redirect(location, status = 302) {
  return { status, headers: new Headers({ location }) };
}

function page(status = 200) {
  return { status, headers: new Headers() };
}

describe("shareService", () => {
  it("域名白名单只放行 y.qq.com 及其子域", () => {
    assert.equal(isAllowedShareHost("y.qq.com"), true);
    assert.equal(isAllowedShareHost("C6.Y.QQ.COM"), true);
    assert.equal(isAllowedShareHost("i.y.qq.com"), true);
    assert.equal(isAllowedShareHost("evil-y.qq.com"), false);
    assert.equal(isAllowedShareHost("qq.com.evil.test"), false);
  });

  it("从各类 QQ 音乐 URL 提取 mid / songid", () => {
    const url = (s) => new URL(s);
    assert.equal(
      extractSongRef(url("https://y.qq.com/n/ryqq_v2/songDetail/0039MnYb0qxYhV")),
      "0039MnYb0qxYhV",
    );
    assert.equal(
      extractSongRef(url("https://i.y.qq.com/v8/playsong.html?songid=1761698&songmid=")),
      "1761698",
    );
    assert.equal(extractSongRef(url("https://y.qq.com/x?songmid=0039MnYb0qxYhV")), "0039MnYb0qxYhV");
    assert.equal(extractSongRef(url("https://y.qq.com/n/ryqq/toplist/26")), null);
  });

  it("songDetail 链接直接取 mid, 不发网络请求", async () => {
    const client = fakeClient();
    let fetches = 0;
    const svc = new ShareService(client, {
      fetch: async () => {
        fetches++;
        return page();
      },
    });
    const data = await svc.resolve("https://y.qq.com/n/ryqq_v2/songDetail/0039MnYb0qxYhV");
    assert.deepEqual(data, { mid: "0039MnYb0qxYhV" });
    assert.equal(fetches, 0);
    assert.equal(client.calls.length, 0);
  });

  it("短链 302 到 songDetail 时取路径里的 mid", async () => {
    const client = fakeClient();
    const seen = [];
    const svc = new ShareService(client, {
      fetch: async (url, init) => {
        seen.push({ url, redirect: init.redirect, ua: init.headers["user-agent"] });
        return redirect("https://y.qq.com/n/ryqq_v2/songDetail/0039MnYb0qxYhV");
      },
    });
    const data = await svc.resolve(SHORT);
    assert.deepEqual(data, { mid: "0039MnYb0qxYhV" });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, SHORT);
    assert.equal(seen[0].redirect, "manual");
    assert.match(seen[0].ua, /Chrome/);
  });

  it("短链 302 到 playsong 的 songid 时换算出 songmid", async () => {
    const client = fakeClient();
    const svc = new ShareService(client, {
      fetch: async () =>
        redirect("https://i.y.qq.com/v8/playsong.html?songid=1761698&from=share#wechat_redirect"),
    });
    const data = await svc.resolve(SHORT);
    assert.deepEqual(client.calls, [["1761698"]]);
    assert.equal(data.mid, "0039MnYb0qxYhV");
    assert.equal(data.name, "晴天");
    assert.equal(data.singer, "周杰伦");
  });

  it("多级跳转仍能收敛到歌曲", async () => {
    const client = fakeClient();
    const chain = [
      () => redirect("https://c6.y.qq.com/base/fcgi-bin/t?__=x"),
      () => redirect("https://y.qq.com/n/ryqq/songDetail/0039MnYb0qxYhV"),
    ];
    let hop = 0;
    const svc = new ShareService(client, {
      fetch: async () => chain[hop++](),
    });
    assert.deepEqual(await svc.resolve(SHORT), { mid: "0039MnYb0qxYhV" });
    assert.equal(hop, 2);
  });

  it("数字 songid 查不到歌曲 -> 404", async () => {
    const client = fakeClient(null);
    const svc = new ShareService(client, {
      fetch: async () => redirect("https://i.y.qq.com/v8/playsong.html?songid=999999"),
    });
    await assert.rejects(svc.resolve(SHORT), (err) => {
      assert.equal(err.statusCode, 404);
      assert.match(err.message, /不存在/);
      return true;
    });
  });

  it("非 QQ 音乐域名直接拒绝", async () => {
    const svc = new ShareService(fakeClient(), {
      fetch: async () => page(),
    });
    await assert.rejects(svc.resolve("https://example.com/u?__=x"), (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /仅支持 QQ 音乐/);
      return true;
    });
    await assert.rejects(svc.resolve("ftp://y.qq.com/x"), (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    });
  });

  it("跳转出 QQ 音乐域名被拦截", async () => {
    const svc = new ShareService(fakeClient(), {
      fetch: async () => redirect("https://evil.test/songDetail/0039MnYb0qxYhV"),
    });
    await assert.rejects(svc.resolve(SHORT), (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /非 QQ 音乐域名/);
      return true;
    });
  });

  it("落到非单曲页面 -> 400, 跳转过多 -> 502", async () => {
    const notSong = new ShareService(fakeClient(), { fetch: async () => page() });
    await assert.rejects(notSong.resolve(SHORT), (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /不指向单曲/);
      return true;
    });

    const loop = new ShareService(fakeClient(), {
      maxRedirects: 2,
      fetch: async () => redirect("https://c6.y.qq.com/base/fcgi-bin/u?__=again"),
    });
    await assert.rejects(loop.resolve(SHORT), (err) => {
      assert.equal(err.statusCode, 502);
      assert.match(err.message, /跳转次数过多/);
      return true;
    });
  });

  it("请求异常或超时 -> 502", async () => {
    const boom = new ShareService(fakeClient(), {
      fetch: async () => {
        throw new Error("ECONNRESET");
      },
    });
    await assert.rejects(boom.resolve(SHORT), (err) => {
      assert.equal(err.statusCode, 502);
      assert.match(err.message, /ECONNRESET/);
      return true;
    });

    const slow = new ShareService(fakeClient(), {
      timeoutMs: 20,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    });
    await assert.rejects(slow.resolve(SHORT), (err) => {
      assert.equal(err.statusCode, 502);
      return true;
    });
  });
});
