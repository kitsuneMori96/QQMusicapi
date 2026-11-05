/**
 * 合集 (专辑 / 歌单) 详情 API.
 *
 * - getAlbumInfo      专辑基本信息 (名称 / 歌手 / 发行日期 / 简介)
 * - getAlbumSongs     专辑曲目, 按 begin/num 切片, 每条多包一层 songInfo
 * - getSonglist       歌单信息 + 曲目, 一次取回, 曲目与搜索结果同形
 */

import { ApiModule } from "./base.js";

export class CollectionApi extends ApiModule {
  /** 专辑头部信息 */
  getAlbumInfo(albumMid) {
    return this._buildRequest(
      "music.musichallAlbum.AlbumInfoServer",
      "GetAlbumDetail",
      { albummid: albumMid, order: 1 },
    );
  }

  /** 专辑曲目 (分页) */
  getAlbumSongs(albumMid, begin = 0, num = 50) {
    return this._buildRequest(
      "music.musichallAlbum.AlbumSongList",
      "GetAlbumSongList",
      { albumMid, begin, num },
    );
  }

  /**
   * 歌单详情 (分页)。
   * 上游只认数字 disstid: 传字符串回 -100008 param error, 这里统一转换。
   */
  getSonglist(dissid, songBegin = 0, songNum = 30) {
    return this._buildRequest(
      "music.srfDissInfo.DissInfo",
      "CgiGetDiss",
      {
        disstid: Number(dissid),
        dirid: 0,
        tag: 1,
        userinfo: 1,
        song_begin: songBegin,
        song_num: songNum,
      },
    );
  }
}
