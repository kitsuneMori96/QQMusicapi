/**
 * 音频标签写入 (纯 JS, 无外部二进制).
 *
 * - mp3: node-id3, 内存 buffer -> buffer, 写 TIT2/TPE1/TALB/... + APIC 封面 + USLT 歌词
 * - flac: flac-tagger (写入 API 基于文件路径), 用系统临时文件中转后读回
 *
 * 其它容器 (m4a/ogg/mp4/nac) 不在此处理, 由上层走「仅重命名」.
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { writeFile, readFile, unlink } from "node:fs/promises";
import NodeID3 from "node-id3";
import { writeFlacTags, PictureType } from "flac-tagger";

/**
 * @typedef {Object} AudioMeta
 * @property {string} title
 * @property {string[]} artists        多歌手
 * @property {string} [album]
 * @property {string} [albumArtist]
 * @property {string|number} [year]
 * @property {string} [genre]
 * @property {{number:number,count?:number}|number} [track]
 * @property {string} [lyric]          纯文本 LRC
 * @property {{buffer:Buffer,mime:string}|null} [cover]
 */

function artistString(meta) {
  const list = Array.isArray(meta.artists) ? meta.artists.filter(Boolean) : [];
  const joined = list.join("、") || meta.albumArtist || "";
  return joined || "Unknown Artist";
}

/** 发行日常为 "2003-07-31", 标签里只保留年份 */
function yearString(value) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  return s.match(/(\d{4})/)?.[1] ?? s;
}

/** QQ 详情里 genre 是数字 ID, 无映射表时写进去只会变成噪音 */
function genreString(value) {
  const s = String(value ?? "").trim();
  if (!s || /^\d+$/.test(s)) return "";
  return s;
}

/** 给 mp3 写入标签, 返回新 Buffer */
export function tagMp3(buffer, meta) {
  const tags = {
    title: meta.title || "Unknown Title",
    artist: artistString(meta),
  };
  if (meta.album) tags.album = meta.album;
  if (meta.albumArtist) tags.albumArtist = meta.albumArtist;
  if (meta.year) tags.year = yearString(meta.year);
  if (genreString(meta.genre)) tags.genre = genreString(meta.genre);
  if (meta.track != null) tags.trackNumber = meta.track;
  if (meta.lyric) {
    tags.unsynchronisedLyrics = { language: "chi", text: meta.lyric };
  }
  if (meta.cover?.buffer?.length) {
    tags.image = {
      mime: meta.cover.mime || "image/jpeg",
      type: { id: 3, name: "front cover" },
      description: "",
      imageBuffer: meta.cover.buffer,
    };
  }
  return NodeID3.write(tags, buffer);
}

/** 给 flac 写入标签, 经临时文件中转后返回新 Buffer */
export async function tagFlac(buffer, meta) {
  const tagMap = {};
  if (meta.title) tagMap.TITLE = meta.title;
  const artists = Array.isArray(meta.artists) ? meta.artists.filter(Boolean) : [];
  if (artists.length) tagMap.ARTIST = artists;
  if (meta.album) tagMap.ALBUM = meta.album;
  if (meta.albumArtist) tagMap.ALBUMARTIST = meta.albumArtist;
  if (meta.year) tagMap.DATE = yearString(meta.year);
  if (genreString(meta.genre)) tagMap.GENRE = genreString(meta.genre);
  if (meta.track != null) {
    tagMap.TRACKNUMBER =
      typeof meta.track === "object" && meta.track.count
        ? `${meta.track.number}/${meta.track.count}`
        : String(typeof meta.track === "object" ? meta.track.number : meta.track);
  }
  if (meta.lyric) tagMap.LYRICS = meta.lyric;

  const picture = meta.cover?.buffer?.length
    ? {
        buffer: meta.cover.buffer,
        mime: meta.cover.mime || "image/jpeg",
        pictureType: PictureType.FrontCover,
      }
    : undefined;

  const tmpPath = join(tmpdir(), `qqm-flac-${randomBytes(8).toString("hex")}.flac`);
  await writeFile(tmpPath, buffer);
  try {
    await writeFlacTags({ tagMap, picture }, tmpPath);
    return await readFile(tmpPath);
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

/** 支持的容器判定 */
export function supportsTagging(ext) {
  return ext === ".mp3" || ext === ".flac";
}

/** 按扩展名分派写入标签; 不支持的容器原样返回 buffer */
export async function writeTags(ext, buffer, meta) {
  if (ext === ".mp3") return tagMp3(buffer, meta);
  if (ext === ".flac") return tagFlac(buffer, meta);
  return buffer;
}
