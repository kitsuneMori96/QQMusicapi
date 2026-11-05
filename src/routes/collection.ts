import type { FastifyInstance } from "fastify";
import { ok } from "../http/responses.ts";
import {
  AlbumDetailQuerySchema,
  SonglistDetailQuerySchema,
  type AlbumDetailQuery,
  type SonglistDetailQuery,
} from "../contracts/schemas.ts";

export function registerCollectionRoutes(
  app: FastifyInstance,
  collectionService: any,
): void {
  app.get<{ Querystring: AlbumDetailQuery }>(
    "/album/detail",
    { schema: { querystring: AlbumDetailQuerySchema } },
    async (req) =>
      ok(
        await collectionService.albumDetail(
          req.query.mid,
          req.query.page ?? 1,
          req.query.num ?? 50,
        ),
      ),
  );

  app.get<{ Querystring: SonglistDetailQuery }>(
    "/songlist/detail",
    { schema: { querystring: SonglistDetailQuerySchema } },
    async (req) =>
      ok(
        await collectionService.songlistDetail(
          req.query.dissid,
          req.query.page ?? 1,
          req.query.num ?? 30,
        ),
      ),
  );
}
