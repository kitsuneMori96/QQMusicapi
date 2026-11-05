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

/** 专辑搜索结果 → 紧凑形状；搜索用 albummid（小写），详情接口用 albumMid */
export function normalizeSearchAlbum(raw) {
  const album = raw ?? {};
  return {
    mid: String(album.albummid ?? ""),
    id: Number(album.id ?? 0),
    name: stripHighlight(album.name ?? album.title ?? ""),
    singer: stripHighlight(album.singer ?? joinNames(album.singer_list)),
    songNum: Number(album.song_num ?? 0),
    publishDate: String(album.publish_date ?? ""),
  };
}

/** 歌单搜索结果 → 紧凑形状；身份是字符串 dissid，不是数字 id */
export function normalizeSearchSonglist(raw) {
  const list = raw ?? {};
  return {
    id: String(list.dissid ?? ""),
    name: stripHighlight(list.dissname ?? ""),
    creator: stripHighlight(list.nickname ?? ""),
    songNum: Number(list.songnum ?? 0),
    listenNum: Number(list.listennum ?? 0),
    listenNumText: String(list.listennum_str ?? ""),
    cover: String(list.logo ?? ""),
  };
}

export class SearchService {
  constructor(client) {
    this._client = client;
  }

  /**
   * 按类型搜一轮并归一化。
   * 分页信息在 data.meta（curpage / perpage / sum），不在 body 里；
   * 该类型的条目挂在 body.item_<type>，同样是下标对象。
   */
  async _search(keyword, type, itemKey, normalize, page, num, idKey = "mid") {
    const resp = await this._client.search.searchByType(keyword, type, num, page);
    const body = resp?.body ?? {};
    const meta = resp?.meta ?? {};
    const items = toList(body[itemKey]).map(normalize).filter((item) => item[idKey]);
    return {
      keyword,
      page: Number(meta.curpage ?? page) || Number(page) || 1,
      num: Number(meta.perpage ?? num) || Number(num) || 20,
      total: Number(meta.sum ?? 0) || 0,
      items,
    };
  }

  /** 关键词搜歌 */
  searchSong(keyword, page = 1, num = 20) {
    return this._search(keyword, SearchType.SONG, "item_song", normalizeSearchSong, page, num);
  }

  /** 关键词搜专辑 */
  searchAlbum(keyword, page = 1, num = 20) {
    return this._search(keyword, SearchType.ALBUM, "item_album", normalizeSearchAlbum, page, num);
  }

  /** 关键词搜歌单 */
  searchSonglist(keyword, page = 1, num = 20) {
    return this._search(
      keyword,
      SearchType.SONGLIST,
      "item_songlist",
      normalizeSearchSonglist,
      page,
      num,
      "id",
    );
  }
}
