import assert from "node:assert/strict";
import { describe, it } from "node:test";
import NodeID3 from "node-id3";
import { DownloadError, SongService, extractLrcText } from "../src/services/songService.js";

const AUDIO = Buffer.alloc(64, 0xab);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x05, 0x01, 0x01, 0x00, 0x01, 0xff, 0xd9]);

function fakeClient(urlMap = { MID1: { url: "https://cdn.example/song.mp3" } }) {
  const requests = [];
  const client = {
    song: {
      async getDetail(mids) {
        return {
          tracks: [
            {
              mid: mids[0],
              name: "十年",
              singer: [{ name: "陈奕迅" }],
              album: { name: "Black, Gray and White", mid: "ALB01" },
              pmid: "PMID01",
              interval: 201,
              time_public: "2003-04-15",
              genre: "Pop",
            },
          ],
        };
      },
      async getPlayUrls(mids) {
        return urlMap;
      },
      async getLyrics() {
        return { crypt: 0, lyric: "[00:00.00]词 : 林夕", trans: "", roma: "" };
      },
    },
    async request(_method, url) {
      requests.push(url);
      if (url.includes("y.gtimg.cn")) {
        return { statusCode: 200, headers: { "content-type": "image/jpeg" }, content: JPEG };
      }
      return { statusCode: 200, headers: {}, content: AUDIO };
    },
  };
  return { client, requests };
}

describe("SongService.prepareDownload", () => {
  it("mp3 成功路径: 命名 + 已打标签", async () => {
    const { client, requests } = fakeClient();
    const svc = new SongService(client);
    const res = await svc.prepareDownload("MID1", "M800");

    assert.equal(res.ext, ".mp3");
    assert.equal(res.fileName, "十年 - 陈奕迅.mp3");
    assert.match(res.contentDisposition, /^attachment; filename="/);
    assert.match(res.contentDisposition, /filename\*=UTF-8''/);
    assert.equal(res.mime, "audio/mpeg");
    assert.equal(res.tagged, true);
    assert.equal(res.buffer.subarray(0, 3).toString("latin1"), "ID3");
    assert.equal(res.buffer.length > AUDIO.length, true);

    const tags = NodeID3.read(res.buffer);
    assert.equal(tags.title, "十年");
    assert.equal(tags.artist, "陈奕迅");
    assert.equal(tags.album, "Black, Gray and White");
    assert.equal(tags.unsynchronisedLyrics.text, "[00:00.00]词 : 林夕");

    // 封面走 500x500 候选, 使用 pmid
    assert.ok(requests.some((u) => u.includes("R500x500M000PMID01")));
  });

  it("未知 type 回退 MP3_320", async () => {
    const { client } = fakeClient();
    const svc = new SongService(client);
    const res = await svc.prepareDownload("MID1", "BOGUS");
    assert.equal(res.ext, ".mp3");
    assert.equal(res.fileName, "十年 - 陈奕迅.mp3");
  });

  it("VIP 无权限 -> DownloadError 403", async () => {
    const { client } = fakeClient({
      MID1: { url: "", error: "无权限 / 需要 VIP" },
    });
    const svc = new SongService(client);
    await assert.rejects(
      svc.prepareDownload("MID1", "F000"),
      (e) => e instanceof DownloadError && e.statusCode === 403,
    );
  });

  it("无直链且无 VIP 提示 -> 502", async () => {
    const { client } = fakeClient({ MID1: { url: "", error: "VKey 获取失败" } });
    const svc = new SongService(client);
    await assert.rejects(
      svc.prepareDownload("MID1", "M800"),
      (e) => e instanceof DownloadError && e.statusCode === 502,
    );
  });

  it("详情缺失 -> 404", async () => {
    const { client } = fakeClient();
    client.song.getDetail = async () => ({ tracks: [] });
    const svc = new SongService(client);
    await assert.rejects(
      svc.prepareDownload("MID1", "M800"),
      (e) => e instanceof DownloadError && e.statusCode === 404,
    );
  });

  it("QRC XML 歌词写入前被还原为普通 LRC", async () => {
    const { client } = fakeClient();
    client.song.getLyrics = async () => ({
      crypt: 0,
      lyric:
        '<?xml version="1.0"?>\n<Lyric_1 LyricType="1" LyricContent="[0,2250]晴(0,160)天(160,160)\n"/>',
    });
    const svc = new SongService(client);
    const res = await svc.prepareDownload("MID1", "M800");
    assert.equal(res.meta.lyric, "[00:00.000]晴天");
    const tags = NodeID3.read(res.buffer);
    assert.equal(tags.unsynchronisedLyrics.text, "[00:00.000]晴天");
  });

  it("不支持的容器仅重命名, 不打标签", async () => {
    const { client } = fakeClient({ MID1: { url: "https://cdn.example/song.m4a" } });
    const svc = new SongService(client);
    const res = await svc.prepareDownload("MID1", "C600");
    assert.equal(res.ext, ".m4a");
    assert.equal(res.fileName, "十年 - 陈奕迅.m4a");
    assert.equal(res.tagged, false);
    assert.deepEqual([...res.buffer], [...AUDIO]);
    assert.equal(res.mime, "audio/mp4");
  });

  it("超过大小上限 -> 413", async () => {
    const { client } = fakeClient();
    const svc = new SongService(client, { maxDownloadBytes: 32 });
    await assert.rejects(
      svc.prepareDownload("MID1", "M800"),
      (e) => e instanceof DownloadError && e.statusCode === 413,
    );
  });

  it("封面/歌词失败不阻断下载", async () => {
    const { client } = fakeClient();
    client.request = async (_m, url) => {
      if (url.includes("y.gtimg.cn")) throw new Error("cover down");
      return { statusCode: 200, headers: {}, content: AUDIO };
    };
    client.song.getLyrics = async () => {
      throw new Error("lyric down");
    };
    const svc = new SongService(client);
    const res = await svc.prepareDownload("MID1", "M800");
    assert.equal(res.tagged, true);
    assert.equal(res.buffer.subarray(0, 3).toString("latin1"), "ID3");
    assert.equal(NodeID3.read(res.buffer).title, "十年");
  });

  it("音频非 200 -> 502", async () => {
    const { client } = fakeClient();
    client.request = async () => ({ statusCode: 403, headers: {}, content: Buffer.alloc(0) });
    const svc = new SongService(client);
    await assert.rejects(
      svc.prepareDownload("MID1", "M800"),
      (e) => e instanceof DownloadError && e.statusCode === 502,
    );
  });
});

describe("extractLrcText", () => {
  const QRC_XML =
    '<?xml version="1.0" encoding="utf-8"?>\n<QrcInfos>\n<LyricInfo LyricCount="1">\n' +
    '<Lyric_1 LyricType="1" LyricContent="[ti:晴天]\n[ar:A &amp; B]\n[0,2250]晴(0,160)天(160,160)周(800,160)杰(960,160)伦(1120,160)\n"/>\n</LyricInfo>\n</QrcInfos>';

  it("从 QRC XML 提取并剥掉逐字时间标记", () => {
    const out = extractLrcText(QRC_XML);
    assert.equal(out.includes("LyricContent"), false);
    assert.match(out, /^\[ti:晴天\]/);
    assert.equal(out.includes("[ar:A & B]"), true);
    assert.match(out, /\[00:00\.000\]晴天周杰伦$/);
    assert.equal(/\(\d+,\d+\)/.test(out), false);
  });

  it("普通 LRC 原样透传", () => {
    const plain = "[00:01.00]第一行\n[00:02.00]第二行";
    assert.equal(extractLrcText(plain), plain);
    assert.equal(extractLrcText(""), "");
    assert.equal(extractLrcText(null), null);
  });
});

describe("SongService.resolveLyric", () => {
  it("crypt=0 时直接透出明文", async () => {
    const { client } = fakeClient();
    const svc = new SongService(client);
    const r = await svc.resolveLyric("MID1");
    assert.equal(r.lyric, "[00:00.00]词 : 林夕");
    assert.equal(r.decodeError, undefined);
  });

  it("QRC 解密失败时带 decodeError 而不抛出", async () => {
    const { client } = fakeClient();
    client.song.getLyrics = async () => ({ crypt: 1, lyric: "00112233445566778899aabbccddeeff" });
    const svc = new SongService(client);
    const r = await svc.resolveLyric("MID1");
    assert.match(r.decodeError ?? "", /QRC 解密失败/);
  });
});

describe("SongService.prepareLyricDownload", () => {
  const QRC_XML =
    '<Lyric_0 Version="1" LyricContent="[0,5000](0,2500)(2500,2500)十年[5000,5000](0,5000)陈奕迅"/>';

  it("sidecar 与音频同名，正文是剥掉逐字标记的整行 LRC", async () => {
    const { client } = fakeClient();
    client.song.getLyrics = async () => ({ crypt: 0, lyric: QRC_XML, trans: "", roma: "" });
    const svc = new SongService(client);
    const f = await svc.prepareLyricDownload("MID1", "lyric");
    assert.equal(f.fileName, "十年 - 陈奕迅.lrc");
    assert.equal(f.ext, ".lrc");
    assert.match(f.mime, /^text\/plain/);
    const text = f.buffer.toString("utf8");
    assert.match(text, /^\[00:00\.000\]十年\n\[00:05\.000\]陈奕迅\n$/);
    assert.ok(!text.includes("(0,2500)"), "逐字时间标记必须剥掉");
  });

  it("翻译/罗马音带后缀，不抢原文的自动配对位", async () => {
    const { client } = fakeClient();
    client.song.getLyrics = async () => ({
      crypt: 0,
      lyric: "[00:00.00]十年",
      trans: "[00:00.00]Ten Years",
      roma: "",
    });
    const svc = new SongService(client);
    const f = await svc.prepareLyricDownload("MID1", "trans");
    assert.equal(f.fileName, "十年 - 陈奕迅 (翻译).lrc");
    assert.equal(f.buffer.toString("utf8").trim(), "[00:00.00]Ten Years");
  });

  it("roma 一轨要显式向上游索取", async () => {
    const seen = [];
    const { client } = fakeClient();
    client.song.getLyrics = async (_mid, opts) => {
      seen.push(opts);
      return { crypt: 0, lyric: "", trans: "", roma: "[00:00.00]si nin" };
    };
    const svc = new SongService(client);
    const f = await svc.prepareLyricDownload("MID1", "roma");
    assert.equal(seen[0].roma, true);
    assert.equal(f.fileName, "十年 - 陈奕迅 (罗马音).lrc");
  });

  it("这一轨没有歌词时 404，不产出空文件", async () => {
    const { client } = fakeClient();
    const svc = new SongService(client);
    await assert.rejects(
      () => svc.prepareLyricDownload("MID1", "roma"),
      (e) => e instanceof DownloadError && e.statusCode === 404,
    );
  });

  it("QRC 解密失败时 409，避免把密文写成 .lrc", async () => {
    const { client } = fakeClient();
    client.song.getLyrics = async () => ({ crypt: 1, lyric: "00112233445566778899aabbccddeeff" });
    const svc = new SongService(client);
    await assert.rejects(
      () => svc.prepareLyricDownload("MID1", "lyric"),
      (e) => e instanceof DownloadError && e.statusCode === 409,
    );
  });
});
