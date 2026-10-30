import Router from "@koa/router";
import { ok } from "../http/responses.js";
import { parseSongFileType, resolveSongFileType } from "../modules/song_filetype.js";

export function songRouter(client, songService) {
  const router = new Router({ prefix: "/song" });

  router.get("/detail", async (ctx) => {
    const mids = String(ctx.query.mids ?? "").split(",").filter(Boolean);
    if (mids.length === 0) ctx.throw(400, "mids 必填");
    ctx.body = ok(await client.song.getDetail(mids));
  });

  router.get("/urls", async (ctx) => {
    const mids = String(ctx.query.mids ?? "").split(",").filter(Boolean);
    if (mids.length === 0) ctx.throw(400, "mids 必填");
    const typeStr = String(ctx.query.type ?? "MP3_128");
    const fileType = resolveSongFileType(typeStr) ?? parseSongFileType(typeStr) ?? typeStr;
    ctx.body = ok(await client.song.getPlayUrls(mids, fileType));
  });

  router.get("/lyric", async (ctx) => {
    const mid = String(ctx.query.mid ?? "");
    if (!mid) ctx.throw(400, "mid 必填");
    const wantDecode = String(ctx.query.decode ?? "1") !== "0";
    ctx.body = ok(await songService.resolveLyric(mid, { wantDecode }));
  });

  router.get("/similar", async (ctx) => {
    const songid = ctx.query.songid ?? ctx.query.id;
    if (!songid) ctx.throw(400, "songid 必填 (数字歌曲 ID)");
    ctx.body = ok(await songService.similar(String(songid)));
  });

  router.get("/relatedSonglist", async (ctx) => {
    const mid = String(ctx.query.mid ?? "");
    if (!mid) ctx.throw(400, "mid 必填");
    ctx.body = ok(await client.song.getRelatedSonglist(mid));
  });

  // 新增: 浏览器代理下载 (带元数据文件名 + 内嵌封面/歌词)
  router.get("/download", async (ctx) => {
    const mid = String(ctx.query.mid ?? "");
    if (!mid) ctx.throw(400, "mid 必填");
    const typeStr = String(ctx.query.type ?? "MP3_320");
    const result = await songService.prepareDownload(mid, typeStr);

    ctx.type = result.mime;
    ctx.length = result.fileSize;
    ctx.set("Content-Disposition", result.contentDisposition);
    ctx.set("X-Song-Title", encodeURIComponent(result.meta.title));
    ctx.set("X-Song-Artist", encodeURIComponent((result.meta.artists || []).join(",")));
    ctx.set("X-Tagged", result.tagged ? "1" : "0");
    ctx.body = result.buffer;
  });

  return router;
}
