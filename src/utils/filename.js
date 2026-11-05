/**
 * 下载文件名与 Content-Disposition 构造 (纯函数, 无依赖).
 */

const WINDOWS_ILLEGAL = /[\\/:*?"<>|\x00-\x1f]/g;
const MAX_BASENAME = 180;

/** 多歌手拼接 */
export function joinArtists(artists, sep = "、") {
  const list = Array.isArray(artists) ? artists.filter(Boolean) : artists ? [String(artists)] : [];
  return list.join(sep);
}

/** 清洗单个文件名片段: 去非法字符/控制符、折叠空白、去首尾点与空格、按码点截断 */
export function sanitizeFileName(input, fallback = "") {
  let s = String(input ?? "");
  s = s.replace(WINDOWS_ILLEGAL, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/^[.\s]+|[.\s]+$/g, ""); // Windows 不允许首尾点/空格
  s = Array.from(s).slice(0, MAX_BASENAME).join("");
  return s || fallback;
}

/** 生成 `标题 - 歌手[后缀].ext`；后缀用于同一首歌的多份 sidecar（如翻译歌词） */
export function buildFileName({ title, artists, ext = ".mp3", suffix = "" }) {
  const t = sanitizeFileName(title, "Unknown Title");
  const a = sanitizeFileName(joinArtists(artists), "Unknown Artist");
  return `${t} - ${a}${suffix}${ext}`;
}

const MIME_BY_EXT = {
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".ogg": "audio/ogg",
  ".nac": "application/octet-stream",
  ".lrc": "text/plain; charset=utf-8",
};

export function mimeForExt(ext) {
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/** 非 ASCII 转下划线的 ASCII 回退名 */
function asciiFallback(fileName) {
  const ascii = fileName
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "_");
  return sanitizeFileName(ascii, "download");
}

/** RFC5987 attr-char 之外一律百分号编码 */
function rfc5987Encode(value) {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

/**
 * 构造 Content-Disposition: attachment 头, 同时给出 ASCII 回退与 UTF-8 filename*.
 */
export function contentDisposition(fileName) {
  const fallback = asciiFallback(fileName).replace(/"/g, "");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${rfc5987Encode(fileName)}`;
}
