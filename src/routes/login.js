import Router from "@koa/router";
import { ok } from "../http/responses.js";
import { QrLoginType } from "../modules/login.js";

export function loginRouter(client, store) {
  const router = new Router({ prefix: "/login" });

  // 说明: Client 凭证现由 store 单一来源提供(注入 credentialStore),
  // 对 store 的 replace/merge/clear 会自动反映到 client.credential, 无需手动同步.

  router.get("/status", async (ctx) => {
    const expired = store.credential.musickey
      ? await client.login.checkExpired(store.credential)
      : false;
    ctx.body = ok({
      loggedIn: store.credential.isLoggedIn(),
      expired,
      musicid: store.credential.musicid || null,
      file: store.path,
    });
  });

  router.get("/credential", async (ctx) => {
    const includeSensitive = String(ctx.query.raw ?? "") === "1";
    ctx.body = ok({
      credential: store.toSafeJSON(includeSensitive),
      file: store.path,
    });
  });

  router.put("/credential", async (ctx) => {
    const body = ctx.request.body ?? {};
    const saved = await store.replace(body);
    ctx.body = ok(saved.toJSON());
  });

  router.delete("/credential", async (ctx) => {
    await store.clear();
    ctx.body = ok({ ok: true });
  });

  router.post("/refresh", async (ctx) => {
    const newCred = await client.login.refreshCredential(store.credential);
    await store.replace(newCred);
    ctx.body = ok(newCred.toJSON());
  });

  router.post("/logout", async (ctx) => {
    try {
      await client.login.logout(store.credential);
    } catch {
      // 即使服务端登出失败也允许本地清空
    }
    await store.clear();
    ctx.body = ok({ ok: true });
  });

  router.post("/qrcode", async (ctx) => {
    const body = ctx.request.body ?? {};
    const typeStr = String(body.type ?? "qq");
    const type = typeStr === "wx" ? QrLoginType.WX : typeStr === "mobile" ? QrLoginType.MOBILE : QrLoginType.QQ;
    const qr = await client.login.getQrcode(type);
    ctx.body = ok({
      type: qr.type,
      mime: qr.mime,
      identifier: qr.identifier,
      // 返回 base64 便于前端展示
      data: qr.data.toString("base64"),
    });
  });

  router.post("/checkQrcode", async (ctx) => {
    const body = ctx.request.body ?? {};
    const identifier = String(body.identifier ?? "");
    const type = String(body.type ?? "qq");
    if (!identifier) ctx.throw(400, "identifier 必填");
    const result = await client.login.checkQrcode({
      identifier,
      type: type === "wx" ? QrLoginType.WX : QrLoginType.QQ,
      data: Buffer.alloc(0),
      mime: "",
    });
    let saved = null;
    if (result.credential) {
      await store.replace(result.credential);
      saved = result.credential.toJSON();
    }
    ctx.body = ok({
      event: result.event,
      credential: saved,
    });
  });

  router.post("/sendAuthcode", async (ctx) => {
    const body = ctx.request.body ?? {};
    const phone = body.phone;
    const countryCode = Number(body.countryCode ?? 86);
    if (phone === undefined) ctx.throw(400, "phone 必填");
    ctx.body = ok(await client.login.sendAuthcode(phone, countryCode));
  });

  router.post("/phone", async (ctx) => {
    const body = ctx.request.body ?? {};
    const phone = body.phone;
    const code = String(body.code ?? "");
    if (phone === undefined || !code) ctx.throw(400, "phone 和 code 必填");
    const cred = await client.login.phoneAuthorize(phone, code);
    await store.replace(cred);
    ctx.body = ok(cred.toJSON());
  });

  return router;
}
