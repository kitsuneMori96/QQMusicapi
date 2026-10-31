import type { FastifyInstance } from "fastify";
import { ok } from "../http/responses.ts";
import {
  UserFollowBodySchema,
  UserPageQuerySchema,
  UserUinQuerySchema,
  type UserFollowBody,
  type UserPageQuery,
  type UserUinQuery,
} from "../contracts/schemas.ts";

export function registerUserRoutes(app: FastifyInstance, client: any): void {
  app.get("/user/self", async () => ok(await client.user.getSelfInfo()));

  app.get<{ Querystring: UserUinQuery }>(
    "/user/info",
    { schema: { querystring: UserUinQuerySchema } },
    async (req) => ok(await client.user.getUserInfo(req.query.uin)),
  );

  app.get<{ Querystring: UserPageQuery }>(
    "/user/songlist",
    { schema: { querystring: UserPageQuerySchema } },
    async (req) => {
      const page = Number(req.query.page ?? 1);
      const num = Number(req.query.num ?? 30);
      return ok(await client.user.getUserSonglist(req.query.uin, page, num));
    },
  );

  app.get<{ Querystring: UserPageQuery }>(
    "/user/follows",
    { schema: { querystring: UserPageQuerySchema } },
    async (req) => {
      const page = Number(req.query.page ?? 1);
      const num = Number(req.query.num ?? 30);
      return ok(await client.user.getUserFollows(req.query.uin, page, num));
    },
  );

  app.get<{ Querystring: UserPageQuery }>(
    "/user/fans",
    { schema: { querystring: UserPageQuerySchema } },
    async (req) => {
      const page = Number(req.query.page ?? 1);
      const num = Number(req.query.num ?? 30);
      return ok(await client.user.getUserFans(req.query.uin, page, num));
    },
  );

  app.post<{ Body: UserFollowBody }>(
    "/user/follow",
    { schema: { body: UserFollowBodySchema } },
    async (req) => {
      const follow = Boolean(req.body.follow ?? true);
      return ok(await client.user.follow(req.body.uin, follow));
    },
  );
}
