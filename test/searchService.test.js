import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SearchService,
  normalizeSearchSong,
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
