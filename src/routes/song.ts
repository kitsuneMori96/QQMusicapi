import type { FastifyInstance } from "fastify";
import { ok } from "../http/responses.ts";
import { httpError } from "../http/errorHandler.ts";
import { parseSongFileType, resolveSongFileType } from "../modules/song_filetype.js";
import { extractLrcText } from "../services/songService.js";
import {
  SongDetailQuerySchema,
  SongDownloadQuerySchema,
  SongLyricQuerySchema,
  SongRelatedQuerySchema,
  SongSimilarQuerySchema,
  SongUrlsQuerySchema,
  type SongDetailQuery,
  type SongDownloadQuery,
  type SongLyricQuery,
  type SongRelatedQuery,
  type SongSimilarQuery,
  type SongUrlsQuery,
} from "../contracts/schemas.ts";

export function registerSongRoutes(
  app: FastifyInstance,
  client: any,
  songService: any,
): void {
  app.get<{ Querystring: SongDetailQuery }>(
    "/song/detail",
    { schema: { querystring: SongDetailQuerySchema } },
    async (req) => {
      const mids = req.query.mids.split(",").filter(Boolean);
      if (mids.length === 0) throw httpError(400, "mids 必填");
      return ok(await client.song.getDetail(mids));
    },
  );

  app.get<{ Querystring: SongUrlsQuery }>(
    "/song/urls",
    { schema: { querystring: SongUrlsQuerySchema } },
    async (req) => {
      const mids = req.query.mids.split(",").filter(Boolean);
      if (mids.length === 0) throw httpError(400, "mids 必填");
      const typeStr = String(req.query.type ?? "MP3_128");
      const fileType = resolveSongFileType(typeStr) ?? parseSongFileType(typeStr) ?? typeStr;
      return ok(await client.song.getPlayUrls(mids, fileType));
    },
  );

  app.get<{ Querystring: SongLyricQuery }>(
    "/song/lyric",
    { schema: { querystring: SongLyricQuerySchema } },
    async (req) => {
      const wantDecode = String(req.query.decode ?? "1") !== "0";
      const data = await songService.resolveLyric(req.query.mid, { wantDecode });
      if (wantDecode && req.query.format === "text") {
        for (const key of ["lyric", "trans", "roma"]) {
          if (typeof data[key] === "string") data[key] = extractLrcText(data[key]);
        }
      }
      return ok(data);
    },
  );

  app.get<{ Querystring: SongSimilarQuery }>(
    "/song/similar",
    { schema: { querystring: SongSimilarQuerySchema } },
    async (req) => {
      const songid = req.query.songid ?? req.query.id;
      if (!songid) throw httpError(400, "songid 必填 (数字歌曲 ID)");
      return ok(await songService.similar(String(songid)));
    },
  );

  app.get<{ Querystring: SongRelatedQuery }>(
    "/song/relatedSonglist",
    { schema: { querystring: SongRelatedQuerySchema } },
    async (req) => ok(await client.song.getRelatedSonglist(req.query.mid)),
  );

  // 浏览器代理下载: 按元数据命名 + mp3/flac 内嵌封面/歌词
  app.get<{ Querystring: SongDownloadQuery }>(
    "/song/download",
    { schema: { querystring: SongDownloadQuerySchema } },
    async (req, reply) => {
      const result = await songService.prepareDownload(
        req.query.mid,
        req.query.type ?? "MP3_320",
      );
      reply
        .header("Content-Type", result.mime)
        .header("Content-Length", String(result.fileSize))
        .header("Content-Disposition", result.contentDisposition)
        .header("X-Song-Title", encodeURIComponent(result.meta.title))
        .header("X-Song-Artist", encodeURIComponent((result.meta.artists || []).join(",")))
        .header("X-Tagged", result.tagged ? "1" : "0");
      return reply.send(result.buffer);
    },
  );
}
