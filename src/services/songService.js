/**
 * 歌曲业务编排层.
 *
 * 负责把「请求描述符 + 后处理」从路由里下沉出来:
 *   - 歌词 QRC 解密
 *   - 相似歌曲扁平化
 *   - 详情归一化 / 封面抓取
 *   - 下载准备(取直链 → 拉字节 → 抓封面/歌词 → 按容器写标签 → 组文件名)
 */

import { qrcDecrypt } from "../algorithms/qrc.js";
import { SongFileType, resolveSongFileType } from "../modules/song_filetype.js";
import { writeTags, supportsTagging } from "./tagWriter.js";
import {
  buildFileName,
  contentDisposition as buildContentDisposition,
  mimeForExt,
} from "../utils/filename.js";

/** 下载不可用错误, 携带 HTTP 状态供 errorHandler 透出 */
export class DownloadError extends Error {
  constructor(message, statusCode = 502, data) {
    super(message);
    this.name = "DownloadError";
    this.statusCode = statusCode;
    this.data = data;
  }
}

const XML_ESCAPES = { "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'" };

/** 毫秒 -> LRC 时间轴 [mm:ss.xxx] */
function msToLrcTime(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const x = ms % 1000;
  return `[${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(x).padStart(3, "0")}]`;
}

/**
 * 解密后的 QRC 是 XML, 逐字时间标记会污染纯文本歌词;
 * 这里取出 LyricContent 属性, 把 QRC 行标记 `[起始,时长]` 转成 LRC 时间轴,
 * 再剥掉逐字标记 `(起始,时长)`, 还原普通 LRC.
 */
export function extractLrcText(text) {
  if (!text || !text.includes("<Lyric_")) return text;
  let best = "";
  const re = /LyricContent="((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1].length > best.length) best = m[1];
  }
  if (!best) return text;
  for (const [k, v] of Object.entries(XML_ESCAPES)) best = best.split(k).join(v);
  best = best.replace(/&#(\d+);/g, (_, d) => {
    const c = Number(d);
    return c >= 0x20 && c !== 0x7f ? String.fromCharCode(c) : "";
  });
  best = best.replace(/&amp;/g, "&");
  best = best.replace(/\(\d+,\d+\)/g, "");
  // QRC 原文行间可能同时有换行和空格, 先归一, 再由行标记决定断行
  best = best.replace(/[ \t\r\n]+/g, " ");
  // QRC 每行以 [起始毫秒,时长] 开头 -> 标准 LRC 时间轴, 并断行
  best = best.replace(/\[(\d+),\d+\]/g, (_, start) => `\n${msToLrcTime(Number(start))}`);
  // 元数据标签 [ti:]/[ar:]/[al:] 等各占一行
  best = best.replace(/\]\s*\[((?:ti|ar|al|by|offset|re|ve|length):)/g, "]\n[$1");
  return best
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export class SongService {
  constructor(client, options = {}) {
    this._client = client;
    this._maxDownloadBytes = options.maxDownloadBytes ?? 0; // 0 = 不限
  }

  // ==================== 歌词 ====================

  /**
   * 获取歌词并解码. 复刻原路由内联逻辑, 返回 { raw, lyric, trans, roma, decodeError? }.
   */
  async resolveLyric(mid, { wantDecode = true, trans = true, qrc = true, roma = false } = {}) {
    const data = await this._client.song.getLyrics(mid, { trans, roma, qrc });
    const out = { raw: data };
    if (!wantDecode) return out;
    try {
      if (data.crypt === 1) {
        if (data.lyric) out.lyric = qrcDecrypt(data.lyric);
        if (data.trans) out.trans = qrcDecrypt(data.trans);
        if (data.roma) out.roma = qrcDecrypt(data.roma);
      } else {
        out.lyric = data.lyric ?? "";
        out.trans = data.trans ?? "";
        out.roma = data.roma ?? "";
      }
    } catch (e) {
      out.decodeError = `QRC 解密失败: ${e.message}`;
    }
    return out;
  }

  // ==================== 相似歌曲 ====================

  /** 拉取并把 vecSongNew[].songs[].track 展平 */
  async similar(songid) {
    const data = await this._client.song.getSimilar(String(songid));
    const list = [];
    for (const group of data?.vecSongNew ?? []) {
      for (const entry of group.songs ?? []) {
        if (entry?.track) list.push(entry.track);
      }
    }
    return { list, groups: data?.vecSongNew ?? [] };
  }

  // ==================== 详情归一化 ====================

  /** getDetail([mid]) -> 第一 track 归一化 */
  async normalizeByMid(mid) {
    const res = await this._client.song.getDetail([mid]);
    const t = res?.tracks?.[0];
    if (!t) {
      throw new DownloadError("未找到歌曲详情", 404, { mid });
    }
    const artists = Array.isArray(t.singer) ? t.singer.map((s) => s?.name).filter(Boolean) : [];
    return {
      trackInfo: t,
      title: t.name ?? "Unknown Title",
      artists,
      album: t.album?.name ?? "",
      albumMid: t.album?.mid ?? "",
      albumPmid: t.pmid ?? "",
      durationSec: t.interval ?? 0,
      year: t.time_public ?? t.public_time ?? "",
      genre: t.genre ?? "",
    };
  }

  // ==================== 封面 ====================

  /** 依专辑 mid/pmid 构造候选封面 URL, 逐个尝试拉取, 全失败返回 null */
  async fetchCover(meta) {
    const cands = [];
    const key = meta.albumPmid || meta.albumMid;
    if (key) {
      cands.push(`https://y.gtimg.cn/music/photo_new/T002R500x500M000${key}.jpg`);
      cands.push(`https://y.gtimg.cn/music/photo_new/T002R300x300M000${key}.jpg`);
    }
    for (const url of cands) {
      try {
        const resp = await this._client.request("GET", url, null, null, {
          responseType: "arrayBuffer",
        });
        if (resp.statusCode === 200 && resp.content && resp.content.length > 0) {
          const ct = String(resp.headers?.["content-type"] ?? resp.headers?.get?.("content-type") ?? "");
          return { buffer: resp.content, mime: ct.includes("png") ? "image/png" : "image/jpeg" };
        }
      } catch {
        // 换下一个候选
      }
    }
    return null;
  }

  // ==================== 下载准备 ====================

  /**
   * 组装一次带标签下载所需的全部数据.
   * @param {string} mid
   * @param {string|SongFileType} typeInput 音质 code(如 M800) 或枚举
   */
  async prepareDownload(mid, typeInput) {
    const fileType =
      resolveSongFileType(typeInput) ??
      (typeof typeInput === "string" && /^[A-Z]\d{3}$/i.test(typeInput)
        ? resolveSongFileType(typeInput.toUpperCase())
        : undefined) ??
      SongFileType.MP3_320;

    const ext = fileType.ext;

    const [meta, urlMap] = await Promise.all([
      this.normalizeByMid(mid),
      this._client.song.getPlayUrls([mid], fileType),
    ]);

    const info = urlMap[mid] ?? urlMap[String(mid)];
    if (!info?.url) {
      const msg = info?.error ?? "无可用直链";
      // VIP/无权限 -> 403; 其余 -> 502
      throw new DownloadError(`无法下载: ${msg}`, msg.includes("VIP") || msg.includes("无权限") ? 403 : 502, {
        mid,
        quality: fileType.code,
        reason: msg,
      });
    }

    const audioResp = await this._client.request("GET", info.url, null, null, {
      responseType: "arrayBuffer",
    });
    if (audioResp.statusCode !== 200 || !audioResp.content?.length) {
      throw new DownloadError(`音频拉取失败 (HTTP ${audioResp.statusCode})`, 502, { mid });
    }
    let buffer = audioResp.content;

    if (this._maxDownloadBytes > 0 && buffer.length > this._maxDownloadBytes) {
      throw new DownloadError(
        `文件过大 (${buffer.length} 字节), 超过上限 ${this._maxDownloadBytes}`,
        413,
        { mid },
      );
    }

    // 封面/歌词失败不阻断下载
    const [cover, lyricData] = await Promise.all([
      supportsTagging(ext) ? this.fetchCover(meta) : Promise.resolve(null),
      supportsTagging(ext)
        ? this.resolveLyric(mid, { wantDecode: true, trans: false, roma: false, qrc: true }).catch(() => null)
        : Promise.resolve(null),
    ]);

    const tagMeta = {
      title: meta.title,
      artists: meta.artists,
      album: meta.album,
      year: meta.year,
      genre: meta.genre,
      cover,
      lyric: extractLrcText(lyricData?.lyric) || "",
    };

    let finalBuffer = buffer;
    if (supportsTagging(ext)) {
      try {
        finalBuffer = await writeTags(ext, buffer, tagMeta);
      } catch (e) {
        // 打标签失败 -> 退回原始字节, 仍保证正确命名
        console.error("[qqmusic-api] 写标签失败, 退回原始字节:", e);
        finalBuffer = buffer;
      }
    }

    const fileName = buildFileName({ title: meta.title, artists: meta.artists, ext });
    return {
      buffer: finalBuffer,
      ext,
      fileName,
      contentDisposition: buildContentDisposition(fileName),
      mime: mimeForExt(ext),
      fileSize: finalBuffer.length,
      meta: tagMeta,
      tagged: supportsTagging(ext) && finalBuffer !== buffer,
    };
  }

  /**
   * 歌词单独落盘：不重下音频也要有 sidecar。文件名字干与音频一致，播放器才能自动配对；
   * 翻译/罗马音带后缀，免得抢掉原文那份的配对位。
   * 空歌词和解密失败都不出文件——解密抛异常时字段里可能还是密文。
   */
  async prepareLyricDownload(mid, kind = "lyric") {
    const SUFFIX = { lyric: "", trans: " (翻译)", roma: " (罗马音)" };
    const data = await this.resolveLyric(mid, {
      wantDecode: true,
      trans: kind === "trans",
      roma: kind === "roma",
      qrc: true,
    });
    if (data.decodeError) {
      throw new DownloadError(data.decodeError, 409, { mid, kind });
    }
    const text = extractLrcText(data[kind] ?? "").trim();
    if (!text) {
      throw new DownloadError("这首歌没有这一轨歌词", 404, { mid, kind });
    }
    const meta = await this.normalizeByMid(mid);
    const fileName = buildFileName({
      title: meta.title,
      artists: meta.artists,
      ext: ".lrc",
      suffix: SUFFIX[kind] ?? "",
    });
    const buffer = Buffer.from(`${text}\n`, "utf8");
    return {
      buffer,
      ext: ".lrc",
      fileName,
      contentDisposition: buildContentDisposition(fileName),
      mime: mimeForExt(".lrc"),
      fileSize: buffer.length,
    };
  }
}
