import type { FastifyInstance } from "fastify";
import { ok } from "../http/responses.ts";
import { httpError } from "../http/errorHandler.ts";
import { QrLoginType } from "../modules/login.js";
import {
  LoginCredentialBodySchema,
  LoginPhoneBodySchema,
  LoginQrCheckBodySchema,
  LoginQrCodeBodySchema,
  LoginSendAuthcodeBodySchema,
  type LoginCredentialBody,
  type LoginPhoneBody,
  type LoginQrCheckBody,
  type LoginQrCodeBody,
  type LoginSendAuthcodeBody,
} from "../contracts/schemas.ts";

export function registerLoginRoutes(app: FastifyInstance, client: any, store: any): void {
  // 说明: Client 凭证由 store 单一来源提供(注入 credentialStore),
  // 对 store 的 replace/merge/clear 会自动反映到 client.credential, 无需手动同步.

  app.get("/login/status", async () => {
    const expired = store.credential.musickey
      ? await client.login.checkExpired(store.credential)
      : false;
    return ok({
      loggedIn: store.credential.isLoggedIn(),
      expired,
      musicid: store.credential.musicid || null,
      file: store.path,
    });
  });

  app.get<{ Querystring: { raw?: string } }>("/login/credential", async (req) => {
    const includeSensitive = String(req.query.raw ?? "") === "1";
    return ok({
      credential: store.toSafeJSON(includeSensitive),
      file: store.path,
    });
  });

  app.put<{ Body: LoginCredentialBody }>(
    "/login/credential",
    { schema: { body: LoginCredentialBodySchema } },
    async (req) => {
      const saved = await store.replace(req.body ?? {});
      return ok(saved.toJSON());
    },
  );

  app.delete("/login/credential", async () => {
    await store.clear();
    return ok({ ok: true });
  });

  app.post("/login/refresh", async () => {
    const newCred = await client.login.refreshCredential(store.credential);
    await store.replace(newCred);
    return ok(newCred.toJSON());
  });

  app.post("/login/logout", async () => {
    try {
      await client.login.logout(store.credential);
    } catch {
      // 即使服务端登出失败也允许本地清空
    }
    await store.clear();
    return ok({ ok: true });
  });

  app.post<{ Body: LoginQrCodeBody }>(
    "/login/qrcode",
    { schema: { body: LoginQrCodeBodySchema } },
    async (req) => {
      const typeStr = String(req.body?.type ?? "qq");
      const type =
        typeStr === "wx" ? QrLoginType.WX : typeStr === "mobile" ? QrLoginType.MOBILE : QrLoginType.QQ;
      const qr = await client.login.getQrcode(type);
      return ok({
        type: qr.type,
        mime: qr.mime,
        identifier: qr.identifier,
        // 返回 base64 便于前端展示
        data: qr.data.toString("base64"),
      });
    },
  );

  app.post<{ Body: LoginQrCheckBody }>(
    "/login/checkQrcode",
    { schema: { body: LoginQrCheckBodySchema } },
    async (req) => {
      const identifier = String(req.body?.identifier ?? "");
      const type = String(req.body?.type ?? "qq");
      if (!identifier) throw httpError(400, "identifier 必填");
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
      return ok({ event: result.event, credential: saved });
    },
  );

  app.post<{ Body: LoginSendAuthcodeBody }>(
    "/login/sendAuthcode",
    { schema: { body: LoginSendAuthcodeBodySchema } },
    async (req) => {
      const phone = req.body?.phone;
      const countryCode = Number(req.body?.countryCode ?? 86);
      if (phone === undefined) throw httpError(400, "phone 必填");
      return ok(await client.login.sendAuthcode(phone, countryCode));
    },
  );

  app.post<{ Body: LoginPhoneBody }>(
    "/login/phone",
    { schema: { body: LoginPhoneBodySchema } },
    async (req) => {
      const phone = req.body?.phone;
      const code = String(req.body?.code ?? "");
      if (phone === undefined || !code) throw httpError(400, "phone 和 code 必填");
      const cred = await client.login.phoneAuthorize(phone, code);
      await store.replace(cred);
      return ok(cred.toJSON());
    },
  );
}
