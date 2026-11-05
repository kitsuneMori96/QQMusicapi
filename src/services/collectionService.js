/**
 * 合集详情编排: 把专辑 / 歌单上游结构归一成「头部 + 曲目分页」。
 *
 * 两类上游形态不同: 专辑曲目多包一层 songInfo, 歌单曲目与搜索结果同形;
 * 归一后曲目都由前端按搜歌结果同一套列渲染。
 */

import { httpError } from "../http/errorHandler.ts";
import { normalizeSearchSong } from "./searchService.js";

function pageOf(page, num) {
  const safePage = Number(page) || 1;
  const safeNum = Number(num) || 1;
  return { page: safePage, num: safeNum, begin: (safePage - 1) * safeNum };
}

function trackList(raw, nested) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((item) => normalizeSearchSong(nested ? item?.songInfo : item))
    .filter((track) => track.mid);
}

export class CollectionService {
  constructor(client) {
    this._client = client;
  }

  /**
   * 专辑详情: 头部与曲目是两个上游接口, 并行取。
   * 失效 mid 上游抛 104400; 合法但空专辑只回 totalNum=0, 不当成错误。
   */
  async albumDetail(albumMid, page = 1, num = 50) {
    const slice = pageOf(page, num);
    let info;
    let songs;
    try {
      [info, songs] = await Promise.all([
        this._client.collection.getAlbumInfo(albumMid),
        this._client.collection.getAlbumSongs(albumMid, slice.begin, slice.num),
      ]);
    } catch (error) {
      throw httpError(404, "专辑不存在", { mid: albumMid, cause: error?.message });
    }

    const basic = info?.basicInfo ?? {};
    const total = Number(songs?.totalNum ?? 0) || 0;
    if (!basic.albumMid && total === 0) {
      throw httpError(404, "专辑不存在", { mid: albumMid });
    }

    const singerList = info?.singer?.singerList ?? [];
    return {
      mid: String(basic.albumMid ?? albumMid),
      name: String(basic.albumName ?? ""),
      singer: singerList
        .map((it) => String(it?.name ?? ""))
        .filter(Boolean)
        .join("、"),
      publishDate: String(basic.publishDate ?? ""),
      desc: String(basic.desc ?? ""),
      total,
      page: slice.page,
      num: slice.num,
      hasMore: slice.page * slice.num < total,
      items: trackList(songs?.songList, true),
    };
  }

  /**
   * 歌单详情: 头部与曲目同一响应 (dirinfo + songlist)。
   * 不存在 / 不可见的歌单回负 code 且 dirinfo 空洞, 统一成 404。
   */
  async songlistDetail(dissid, page = 1, num = 30) {
    const slice = pageOf(page, num);
    let resp;
    try {
      resp = await this._client.collection.getSonglist(dissid, slice.begin, slice.num);
    } catch (error) {
      throw httpError(404, "歌单不存在或不可见", { dissid, cause: error?.message });
    }

    const dir = resp?.dirinfo ?? {};
    if (Number(resp?.code ?? 0) !== 0 || !dir.id || !dir.title) {
      throw httpError(404, "歌单不存在或不可见", { dissid });
    }

    const total = Number(dir.songnum ?? resp?.total_song_num ?? 0) || 0;
    return {
      id: String(dir.id),
      name: String(dir.title),
      creator: String(dir.host_nick || dir.creator?.nick || ""),
      cover: String(dir.picurl ?? ""),
      desc: String(dir.desc ?? ""),
      total,
      page: slice.page,
      num: slice.num,
      hasMore: Boolean(resp?.hasmore) || slice.page * slice.num < total,
      items: trackList(resp?.songlist, false),
    };
  }
}
