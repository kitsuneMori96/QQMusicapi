/**
 * 搜索结果的归一化.
 *
 * 上游 do_search_v2 / DoSearchForQQMusicMobile 回的是给客户端渲染的原始结构：
 * 歌曲列表挂在 body.item_song 且是 `{"0":…,"1":…}` 对象而不是数组，每条近百个字段，
 * 标题还分成干净值与带 `<em>` 高亮标记的两个版本。这里只留前端认歌需要的几个。
 */

import { SearchType } from "../modules/search.js";

const HIGHLIGHT_TAG = /<\/?em>/g;

/** 上游的高亮标记只用于客户端渲染，一律剥掉；渲染高亮请前端自己按关键词切分 */
export function stripHighlight(text) {
  return String(text ?? "").replace(HIGHLIGHT_TAG, "");
}

/** item_song 可能是数组，也可能是按下标索引的对象 */
function toList(node) {
  if (Array.isArray(node)) return node;
  if (node && typeof node === "object") {
    return Object.keys(node)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => node[key]);
  }
  return [];
}

function joinNames(list, sep = "、") {
  if (!Array.isArray(list)) return "";
  return list
    .map((it) => stripHighlight(it?.name ?? it?.title ?? ""))
    .filter(Boolean)
    .join(sep);
}

/** 单条搜索结果 → 前端用的紧凑形状；取不到 mid 的条目直接丢弃 */
export function normalizeSearchSong(raw) {
  const song = raw ?? {};
  const album = song.album ?? {};
  return {
    mid: String(song.mid ?? ""),
    id: Number(song.id ?? 0),
    name: stripHighlight(song.name || song.title || song.title_main || ""),
    singer: joinNames(song.singer),
    album: stripHighlight(album.name ?? album.title ?? ""),
    albumMid: String(album.mid ?? album.pmid ?? ""),
    interval: Number(song.interval ?? 0),
  };
}

export class SearchService {
  constructor(client) {
    this._client = client;
  }

  /**
   * 关键词搜歌。分页信息在 data.meta（curpage / perpage / sum），不在 body 里。
   * @returns {Promise<{keyword: string, page: number, num: number, total: number, items: object[]}>}
   */
  async searchSong(keyword, page = 1, num = 20) {
    const resp = await this._client.search.searchByType(
      keyword,
      SearchType.SONG,
      num,
      page,
    );
    const body = resp?.body ?? {};
    const meta = resp?.meta ?? {};
    const items = toList(body.item_song)
      .map(normalizeSearchSong)
      .filter((item) => item.mid);
    return {
      keyword,
      page: Number(meta.curpage ?? page) || Number(page) || 1,
      num: Number(meta.perpage ?? num) || Number(num) || 20,
      total: Number(meta.sum ?? 0) || 0,
      items,
    };
  }
}
