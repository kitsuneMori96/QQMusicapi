import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SearchService,
  normalizeSearchAlbum,
  normalizeSearchSong,
  normalizeSearchSonglist,
  stripHighlight,
} from "../src/services/searchService.js";

/** 上游真实形态的缩样：item_song 是下标对象，标题有两份版本 */
const RAW = {
  body: {
    item_song: {
      0: {
        mid: "0039MnYb0qxYhV",
        id: 97773,
        name: "晴天",
        title: "晴天",
        title_main: "<em>晴天</em>",
        interval: 269,
        album: { mid: "000MkMni19ClKG", name: "叶惠美" },
        singer: [
          { mid: "0025NhlN2yWrP4", name: "周杰伦" },
          { mid: "002jL0Em1v7Gtd", name: "<em>蔡依林</em>" },
        ],
      },
      1: {
        mid: "001nUqRl123456",
        id: 1,
        title_main: "<em>晴天</em> (Live)",
        interval: 0,
        album: {},
        singer: [],
      },
      2: { id: 2, name: "没有 mid 的推广位" },
    },
  },
  meta: { curpage: 2, perpage: 20, sum: 1003 },
};

/** 专辑搜索真实形态缩样：albummid 是小写键，歌手是平铺字符串 */
const RAW_ALBUM = {
  body: {
    item_album: {
      0: {
        albummid: "000MkMni19ClKG",
        id: 8220,
        name: "叶惠美",
        singer: "周杰伦",
        song_num: 11,
        publish_date: "2003-07-31",
        description: "包含「<em>晴天</em>」",
      },
      1: { id: 1, name: "没有 albummid 的推广位" },
    },
  },
  meta: { curpage: 1, perpage: 20, sum: 598 },
};

/** 歌单搜索真实形态缩样：身份是字符串 dissid，封面走 logo */
const RAW_SONGLIST = {
  body: {
    item_songlist: {
      0: {
        dissid: "8231976688",
        dissname: "<em>晴天</em>歌单",
        nickname: "kitsuneMori",
        songnum: 240,
        listennum: 107562,
        listennum_str: "10.8万",
        logo: "https://qpic.y.qq.com/music_cover/x/300?n=1",
      },
      1: { dissname: "没有 dissid 的条目" },
    },
  },
  meta: { curpage: 2, perpage: 20, sum: 489 },
};

function clientWith(payload) {
  const calls = [];
  return {
    calls,
    search: {
      searchByType: async (keyword, type, num, page) => {
        calls.push({ keyword, type, num, page });
        return payload;
      },
    },
  };
}

describe("searchService 工具函数", () => {
  it("stripHighlight 只去标记不动正文", () => {
    assert.equal(stripHighlight("<em>晴天</em> (Live)"), "晴天 (Live)");
    assert.equal(stripHighlight(undefined), "");
  });

  it("normalizeSearchSong 优先用干净字段并拼接歌手", () => {
    const item = normalizeSearchSong(RAW.body.item_song["0"]);
    assert.deepEqual(item, {
      mid: "0039MnYb0qxYhV",
      id: 97773,
      name: "晴天",
      singer: "周杰伦、蔡依林",
      album: "叶惠美",
      albumMid: "000MkMni19ClKG",
      interval: 269,
    });
  });

  it("缺 name/title 时退回高亮版并剥标记", () => {
    const item = normalizeSearchSong(RAW.body.item_song["1"]);
    assert.equal(item.name, "晴天 (Live)");
    assert.equal(item.singer, "");
    assert.equal(item.albumMid, "");
  });
});

describe("SearchService.searchSong", () => {
  it("按下标对象顺序归一化并丢弃无 mid 条目", async () => {
    const client = clientWith(RAW);
    const result = await new SearchService(client).searchSong("晴天", 2, 20);
    assert.equal(client.calls[0].page, 2);
    assert.equal(client.calls[0].num, 20);
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].mid, "0039MnYb0qxYhV");
    assert.equal(result.items[1].mid, "001nUqRl123456");
  });

  it("分页取自 meta，不是 body", async () => {
    const result = await new SearchService(clientWith(RAW)).searchSong("晴天", 2, 20);
    assert.deepEqual(
      { keyword: result.keyword, page: result.page, num: result.num, total: result.total },
      { keyword: "晴天", page: 2, num: 20, total: 1003 },
    );
  });

  it("数组形态的 item_song 同样可用，缺字段不炸", async () => {
    const service = new SearchService(
      clientWith({ body: { item_song: [{ mid: "m1", name: "A" }] } }),
    );
    const result = await service.searchSong("A");
    assert.equal(result.page, 1);
    assert.equal(result.num, 20);
    assert.equal(result.total, 0);
    assert.deepEqual(result.items.map((i) => i.mid), ["m1"]);
  });

  it("上游整个空响应也回空列表而不是抛", async () => {
    const result = await new SearchService(clientWith(null)).searchSong("无结果");
    assert.deepEqual(result.items, []);
    assert.equal(result.page, 1);
  });
});

describe("searchService 专辑 / 歌单", () => {
  it("normalizeSearchAlbum 认 albummid，缺歌手列表也不炸", () => {
    assert.deepEqual(normalizeSearchAlbum(RAW_ALBUM.body.item_album["0"]), {
      mid: "000MkMni19ClKG",
      id: 8220,
      name: "叶惠美",
      singer: "周杰伦",
      songNum: 11,
      publishDate: "2003-07-31",
    });
    assert.deepEqual(normalizeSearchAlbum({}), {
      mid: "",
      id: 0,
      name: "",
      singer: "",
      songNum: 0,
      publishDate: "",
    });
  });

  it("normalizeSearchSonglist 保留字符串 dissid 与播放量文案，剥高亮", () => {
    assert.deepEqual(normalizeSearchSonglist(RAW_SONGLIST.body.item_songlist["0"]), {
      id: "8231976688",
      name: "晴天歌单",
      creator: "kitsuneMori",
      songNum: 240,
      listenNum: 107562,
      listenNumText: "10.8万",
      cover: "https://qpic.y.qq.com/music_cover/x/300?n=1",
    });
  });

  it("searchAlbum 用 type=ALBUM 取 item_album，丢掉没有 albummid 的条目", async () => {
    const client = clientWith(RAW_ALBUM);
    const result = await new SearchService(client).searchAlbum("晴天", 1, 20);
    assert.equal(client.calls[0].type, 2);
    assert.deepEqual(result.items.map((i) => i.mid), ["000MkMni19ClKG"]);
    assert.deepEqual(
      { page: result.page, num: result.num, total: result.total },
      { page: 1, num: 20, total: 598 },
    );
  });

  it("searchSonglist 用 type=SONGLIST，身份字段是 id 不是 mid", async () => {
    const client = clientWith(RAW_SONGLIST);
    const result = await new SearchService(client).searchSonglist("晴天", 2, 20);
    assert.equal(client.calls[0].type, 3);
    assert.deepEqual(result.items.map((i) => i.id), ["8231976688"]);
    assert.equal(result.page, 2);
    assert.equal(result.total, 489);
  });

  it("上游空组时两类都回空列表", async () => {
    const service = new SearchService(clientWith({ body: {}, meta: {} }));
    assert.deepEqual((await service.searchAlbum("x")).items, []);
    assert.deepEqual((await service.searchSonglist("x")).items, []);
  });
});
