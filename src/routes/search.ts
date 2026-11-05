import type { FastifyInstance } from "fastify";
import { ok } from "../http/responses.ts";
import { SearchType } from "../modules/search.js";
import {
  CollectionSearchQuerySchema,
  SearchByTypeBodySchema,
  SearchGeneralBodySchema,
  SearchKeywordQuerySchema,
  SongSearchQuerySchema,
  type CollectionSearchQuery,
  type SearchByTypeBody,
  type SearchGeneralBody,
  type SearchKeywordQuery,
  type SongSearchQuery,
} from "../contracts/schemas.ts";

export function registerSearchRoutes(
  app: FastifyInstance,
  client: any,
  searchService: any,
): void {
  app.get("/search/hotkey", async () => ok(await client.search.getHotkey()));

  // 归一化搜歌：上游原始结构留给上面几条，前端只消费这一条
  app.get<{ Querystring: SongSearchQuery }>(
    "/search/song",
    { schema: { querystring: SongSearchQuerySchema } },
    async (req) =>
      ok(await searchService.searchSong(req.query.keyword, req.query.page ?? 1, req.query.num ?? 20)),
  );

  app.get<{ Querystring: CollectionSearchQuery }>(
    "/search/album",
    { schema: { querystring: CollectionSearchQuerySchema } },
    async (req) =>
      ok(await searchService.searchAlbum(req.query.keyword, req.query.page ?? 1, req.query.num ?? 20)),
  );

  app.get<{ Querystring: CollectionSearchQuery }>(
    "/search/songlist",
    { schema: { querystring: CollectionSearchQuerySchema } },
    async (req) =>
      ok(
        await searchService.searchSonglist(req.query.keyword, req.query.page ?? 1, req.query.num ?? 20),
      ),
  );

  app.get<{ Querystring: SearchKeywordQuery }>(
    "/search/complete",
    { schema: { querystring: SearchKeywordQuerySchema } },
    async (req) => ok(await client.search.complete(req.query.keyword)),
  );

  app.get<{ Querystring: SearchKeywordQuery }>(
    "/search/quick",
    { schema: { querystring: SearchKeywordQuerySchema } },
    async (req) => ok(await client.search.quickSearch(req.query.keyword)),
  );

  app.post<{ Body: SearchGeneralBody }>(
    "/search/general",
    { schema: { body: SearchGeneralBodySchema } },
    async (req) => {
      const { keyword, page, num, searchid, pageStart, highlight } = req.body;
      return ok(
        await client.search.generalSearch(
          keyword,
          page ?? 1,
          num ?? 15,
          searchid ?? null,
          pageStart ?? null,
          highlight ?? true,
        ),
      );
    },
  );

  app.post<{ Body: SearchByTypeBody }>(
    "/search/byType",
    { schema: { body: SearchByTypeBodySchema } },
    async (req) => {
      const { keyword, type, num, page, searchid, highlight } = req.body;
      return ok(
        await client.search.searchByType(
          keyword,
          type ?? SearchType.SONG,
          num ?? 10,
          page ?? 1,
          searchid ?? null,
          highlight ?? true,
        ),
      );
    },
  );
}
