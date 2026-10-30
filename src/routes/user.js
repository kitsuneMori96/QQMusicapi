import Router from "@koa/router";
import { ok } from "../http/responses.js";

export function userRouter(client) {
  const router = new Router({ prefix: "/user" });

  router.get("/self", async (ctx) => {
    ctx.body = ok(await client.user.getSelfInfo());
  });

  router.get("/info", async (ctx) => {
    const uin = String(ctx.query.uin ?? "");
    if (!uin) ctx.throw(400, "uin 必填");
    ctx.body = ok(await client.user.getUserInfo(uin));
  });

  router.get("/songlist", async (ctx) => {
    const uin = String(ctx.query.uin ?? "");
    if (!uin) ctx.throw(400, "uin 必填");
    const page = Number(ctx.query.page ?? 1);
    const num = Number(ctx.query.num ?? 30);
    ctx.body = ok(await client.user.getUserSonglist(uin, page, num));
  });

  router.get("/follows", async (ctx) => {
    const uin = String(ctx.query.uin ?? "");
    if (!uin) ctx.throw(400, "uin 必填");
    const page = Number(ctx.query.page ?? 1);
    const num = Number(ctx.query.num ?? 30);
    ctx.body = ok(await client.user.getUserFollows(uin, page, num));
  });

  router.get("/fans", async (ctx) => {
    const uin = String(ctx.query.uin ?? "");
    if (!uin) ctx.throw(400, "uin 必填");
    const page = Number(ctx.query.page ?? 1);
    const num = Number(ctx.query.num ?? 30);
    ctx.body = ok(await client.user.getUserFans(uin, page, num));
  });

  router.post("/follow", async (ctx) => {
    const body = ctx.request.body ?? {};
    const uin = String(body.uin ?? "");
    const follow = Boolean(body.follow ?? true);
    if (!uin) ctx.throw(400, "uin 必填");
    ctx.body = ok(await client.user.follow(uin, follow));
  });

  return router;
}
