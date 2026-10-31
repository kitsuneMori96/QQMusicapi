/**
 * QQ 音乐分享链接解析.
 *
 * 支持的输入:
 *   - c6.y.qq.com/base/fcgi-bin/u?__=xxx 短链 (302 -> playsong / songDetail)
 *   - i.y.qq.com/v8/playsong.html?...&songid=xxx
 *   - y.qq.com/n/.../songDetail/{songmid|songid}
 *
 * 数字 songid 通过 client.song.getDetail 换成 songmid;
 * 跳转链只允许 QQ 音乐域名, 并限制跳转次数与超时, 避免被当成任意 URL 代理.
 */

import { httpError } from "../http/errorHandler.ts";

const QQ_ROOT_HOST = "y.qq.com";
const QQ_HOST_SUFFIX = ".y.qq.com";
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export function isAllowedShareHost(hostname) {
  const host = String(hostname ?? "").toLowerCase();
  return host === QQ_ROOT_HOST || host.endsWith(QQ_HOST_SUFFIX);
}

/** 从 QQ 音乐 URL 中提取 songmid 或数字 songid; 取不到返回 null. */
export function extractSongRef(url) {
  const detail = url.pathname.match(/\/songDetail\/([A-Za-z0-9]+)/);
  if (detail?.[1]) return detail[1];

  const songid = url.searchParams.get("songid");
  if (songid && /^\d+$/.test(songid)) return songid;

  const songmid = url.searchParams.get("songmid");
  if (songmid && /^[A-Za-z0-9]{10,20}$/.test(songmid)) return songmid;

  return null;
}

function parseShareUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl ?? "").trim());
  } catch {
    throw httpError(400, "分享链接格式不正确");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw httpError(400, "仅支持 http(s) 分享链接");
  }
  if (url.username || url.password || (url.port && url.port !== "80" && url.port !== "443")) {
    throw httpError(400, "分享链接格式不正确");
  }
  if (!isAllowedShareHost(url.hostname)) {
    throw httpError(400, "仅支持 QQ 音乐分享链接");
  }
  return url;
}

export class ShareService {
  constructor(client, options = {}) {
    this._client = client;
    this._fetch = options.fetch ?? globalThis.fetch;
    this._timeoutMs = options.timeoutMs ?? 8000;
    this._maxRedirects = options.maxRedirects ?? 4;
  }

  /**
   * @param {string} rawUrl QQ 音乐分享链接
   * @returns {Promise<{mid: string, id?: number|string, name?: string, singer?: string}>}
   */
  async resolve(rawUrl) {
    const start = parseShareUrl(rawUrl);
    const direct = extractSongRef(start);
    if (direct) return this._toResult(direct);

    let url = start;
    for (let hop = 0; hop <= this._maxRedirects; hop++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this._timeoutMs);
      let res;
      try {
        res = await this._fetch(url.toString(), {
          redirect: "manual",
          headers: { "user-agent": DESKTOP_UA, accept: "text/html,application/xhtml+xml" },
          signal: controller.signal,
        });
      } catch (error) {
        throw httpError(502, `分享链接请求失败: ${error?.message ?? error}`);
      } finally {
        clearTimeout(timer);
      }

      if (REDIRECT_STATUS.has(res.status)) {
        const location = res.headers.get("location");
        if (!location) throw httpError(502, "分享链接跳转缺少地址");
        let next;
        try {
          next = new URL(location, url);
        } catch {
          throw httpError(502, "分享链接跳转地址无效");
        }
        if (!isAllowedShareHost(next.hostname)) {
          throw httpError(400, "分享链接跳转到了非 QQ 音乐域名");
        }
        const ref = extractSongRef(next);
        if (ref) return this._toResult(ref);
        url = next;
        continue;
      }

      if (res.status >= 400) {
        throw httpError(502, `分享页面请求失败 (HTTP ${res.status})`);
      }
      // 已到达页面但没有可直接识别的 songid: 可能是歌单/专辑/歌手分享
      throw httpError(400, "该分享链接不指向单曲（可能是歌单或专辑），暂不支持");
    }

    throw httpError(502, "分享链接跳转次数过多");
  }

  async _toResult(ref) {
    if (!/^\d+$/.test(ref)) return { mid: ref };

    const detail = await this._client.song.getDetail([ref]);
    const track = detail?.tracks?.[0];
    if (!track?.mid) throw httpError(404, "分享的歌曲不存在或已下架");
    const singer = (track.singer ?? [])
      .map((s) => s?.name)
      .filter(Boolean)
      .join(" / ");
    return {
      mid: String(track.mid),
      id: track.id ?? Number(ref),
      name: track.name,
      singer,
    };
  }
}
