import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CollectionApi } from "../src/modules/collection.js";
import { CollectionService } from "../src/services/collectionService.js";

const ALBUM_INFO = {
  basicInfo: {
    albumMid: "000MkMni19ClKG",
    albumName: "叶惠美",
    publishDate: "2003-07-31",
    desc: "第四张专辑",
  },
  singer: { singerList: [{ name: "周杰伦" }, { name: "方文山" }] },
  extra: null,
};

const ALBUM_SONGS = {
  albumMid: "000MkMni19ClKG",
  totalNum: 11,
  curBegin: 0,
  songList: [
    {
      songInfo: {
        mid: "003BkwkH0iS8Ko",
        id: 97781,
        name: "双刀",
        interval: 291,
        album: { mid: "000MkMni19ClKG", name: "叶惠美" },
        singer: [{ name: "周杰伦" }],
      },
    },
    { songInfo: { id: 2, name: "没有 mid 的推广位" } },
  ],
};

/** 歌单曲目与搜索结果同形（扁平），不是专辑那种 songInfo 嵌套 */
const SONGLIST = {
  code: 0,
  dirinfo: {
    id: 8231976688,
    title: "主歌单",
    host_nick: "kitsuneMori",
    picurl: "https://qpic.y.qq.com/music_cover/x/600",
    desc: "我的歌单",
    songnum: 240,
  },
  songlist_size: 1,
  hasmore: 1,
  songlist: [
    {
      mid: "001P8ALZ0UlDs9",
      id: 108490459,
      name: "月夜の君と空の上",
      interval: 339,
      singer: [{ name: "風華" }],
      album: { mid: "00450rzw2xKW7a", name: "いつか" },
    },
  ],
};

function clientWith({ info = ALBUM_INFO, songs = ALBUM_SONGS, songlist = SONGLIST } = {}) {
  const calls = [];
  const maybeThrow = (payload) => {
    if (payload instanceof Error) throw payload;
    return payload;
  };
  return {
    calls,
    collection: {
      getAlbumInfo: async (mid) => {
        calls.push({ kind: "info", mid });
        return maybeThrow(info);
      },
      getAlbumSongs: async (mid, begin, num) => {
        calls.push({ kind: "songs", mid, begin, num });
        return maybeThrow(songs);
      },
      getSonglist: async (dissid, begin, num) => {
        calls.push({ kind: "songlist", dissid, begin, num });
        return maybeThrow(songlist);
      },
    },
  };
}

async function expect404(promise, message) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.statusCode, 404);
    assert.equal(error.message, message);
    return true;
  });
}

describe("CollectionApi", () => {
  it("getSonglist 把字符串 dissid 转成数字（上游只认数字）", () => {
    const api = new CollectionApi({});
    const request = api.getSonglist("8231976688", 30, 30);
    assert.equal(request.param.disstid, 8231976688);
    assert.equal(request.param.song_begin, 30);
    assert.equal(request.method, "CgiGetDiss");
  });
});

describe("collectionService 专辑", () => {
  it("头部与曲目并行取，曲目从 songInfo 里取并丢掉无 mid 的条目", async () => {
    const client = clientWith();
    const data = await new CollectionService(client).albumDetail("000MkMni19ClKG", 1, 50);
    assert.deepEqual(data, {
      mid: "000MkMni19ClKG",
      name: "叶惠美",
      singer: "周杰伦、方文山",
      publishDate: "2003-07-31",
      desc: "第四张专辑",
      total: 11,
      page: 1,
      num: 50,
      hasMore: false,
      items: [
        {
          mid: "003BkwkH0iS8Ko",
          id: 97781,
          name: "双刀",
          singer: "周杰伦",
          album: "叶惠美",
          albumMid: "000MkMni19ClKG",
          interval: 291,
        },
      ],
    });
    assert.deepEqual(client.calls, [
      { kind: "info", mid: "000MkMni19ClKG" },
      { kind: "songs", mid: "000MkMni19ClKG", begin: 0, num: 50 },
    ]);
  });

  it("页码换算成 begin，还没取完就 hasMore", async () => {
    const client = clientWith();
    const data = await new CollectionService(client).albumDetail("000MkMni19ClKG", 2, 5);
    assert.equal(client.calls[1].begin, 5);
    assert.equal(data.hasMore, true);
  });

  it("合法但空专辑不报 404", async () => {
    const data = await new CollectionService(
      clientWith({ songs: { totalNum: 0, songList: [] } }),
    ).albumDetail("000MkMni19ClKG");
    assert.deepEqual(data.items, []);
    assert.equal(data.total, 0);
  });

  it("失效 mid（上游抛错）归成 404", async () => {
    const error = new Error("业务返回非零码");
    error.code = 104400;
    await expect404(
      new CollectionService(clientWith({ songs: error })).albumDetail("ZZZZZZZZZZZZ"),
      "专辑不存在",
    );
  });

  it("头部与曲目都空时 404", async () => {
    await expect404(
      new CollectionService(
        clientWith({ info: { basicInfo: {} }, songs: { totalNum: 0, songList: [] } }),
      ).albumDetail("ZZZZZZZZZZZZ"),
      "专辑不存在",
    );
  });
});

describe("collectionService 歌单", () => {
  it("disstid 转成数字传给上游，头部与扁平曲目一次取回", async () => {
    const client = clientWith();
    const data = await new CollectionService(client).songlistDetail("8231976688", 1, 30);
    assert.deepEqual(client.calls, [
      { kind: "songlist", dissid: "8231976688", begin: 0, num: 30 },
    ]);
    assert.equal(data.id, "8231976688");
    assert.equal(data.name, "主歌单");
    assert.equal(data.creator, "kitsuneMori");
    assert.equal(data.cover, "https://qpic.y.qq.com/music_cover/x/600");
    assert.equal(data.total, 240);
    assert.equal(data.hasMore, true);
    assert.deepEqual(data.items.map((i) => i.mid), ["001P8ALZ0UlDs9"]);
    assert.equal(data.items[0].album, "いつか");
  });

  it("第二页的 song_begin 按每页条数换算", async () => {
    const client = clientWith();
    await new CollectionService(client).songlistDetail("8231976688", 2, 30);
    assert.equal(client.calls[0].begin, 30);
  });

  it("负 code / 空洞 dirinfo 都归成 404", async () => {
    const bad = { code: -100006, dirinfo: { id: 999, title: "" }, songlist: [] };
    await expect404(
      new CollectionService(clientWith({ songlist: bad })).songlistDetail("999"),
      "歌单不存在或不可见",
    );
  });

  it("上游抛错同样归成 404", async () => {
    await expect404(
      new CollectionService(clientWith({ songlist: new Error("boom") })).songlistDetail("1"),
      "歌单不存在或不可见",
    );
  });
});
