import Router from "@koa/router";
import { ok } from "../http/responses.js";
import { SearchType } from "../modules/search.js";

export function searchRouter(client) {
  const router = new Router({ prefix: "/search" });

  router.get("/hotkey", async (ctx) => {
    ctx.body = ok(await client.search.getHotkey());
  });

  router.get("/complete", async (ctx) => {
    const keyword = String(ctx.query.keyword ?? "");
    if (!keyword) ctx.throw(400, "keyword 必填");
    ctx.body = ok(await client.search.complete(keyword));
  });

  router.get("/quick", async (ctx) => {
    const keyword = String(ctx.query.keyword ?? "");
    if (!keyword) ctx.throw(400, "keyword 必填");
    ctx.body = ok(await client.search.quickSearch(keyword));
  });

  router.post("/general", async (ctx) => {
    const body = ctx.request.body ?? {};
    const { keyword, page, num, searchid, pageStart, highlight } = body;
    if (!keyword) ctx.throw(400, "keyword 必填");
    ctx.body = ok(
      await client.search.generalSearch(
        keyword,
        page ?? 1,
        num ?? 15,
        searchid ?? null,
        pageStart ?? null,
        highlight ?? true,
      ),
    );
  });

  router.post("/byType", async (ctx) => {
    const body = ctx.request.body ?? {};
    const { keyword, type, num, page, searchid, highlight } = body;
    if (!keyword) ctx.throw(400, "keyword 必填");
    ctx.body = ok(
      await client.search.searchByType(
        keyword,
        type ?? SearchType.SONG,
        num ?? 10,
        page ?? 1,
        searchid ?? null,
        highlight ?? true,
      ),
    );
  });

  return router;
}
