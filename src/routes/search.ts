import type { FastifyInstance } from "fastify";
import { ok } from "../http/responses.ts";
import { SearchType } from "../modules/search.js";
import {
  SearchByTypeBodySchema,
  SearchGeneralBodySchema,
  SearchKeywordQuerySchema,
  type SearchByTypeBody,
  type SearchGeneralBody,
  type SearchKeywordQuery,
} from "../contracts/schemas.ts";

export function registerSearchRoutes(app: FastifyInstance, client: any): void {
  app.get("/search/hotkey", async () => ok(await client.search.getHotkey()));

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
