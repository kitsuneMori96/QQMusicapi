import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { errorHandler } from "../src/http/errorHandler.js";
import {
  ApiDataError,
  CredentialInvalidError,
  CredentialRefreshError,
  HTTPError,
  NetworkError,
  RatelimitedError,
} from "../src/exceptions.js";

async function run(thrower) {
  const ctx = { status: 200, body: null };
  await errorHandler(ctx, () => thrower());
  return ctx;
}

describe("errorHandler", () => {
  it("显式 statusCode 4xx 原样透出", async () => {
    const err = Object.assign(new Error("mid 必填"), { statusCode: 400 });
    const ctx = await run(() => {
      throw err;
    });
    assert.equal(ctx.status, 400);
    assert.equal(ctx.body.code, 400);
    assert.equal(ctx.body.message, "mid 必填");
  });

  it("HTTPError 携带 statusCode 时透出", async () => {
    const ctx = await run(() => {
      throw new HTTPError("上游炸了", { statusCode: 503, code: 12345 });
    });
    assert.equal(ctx.status, 503);
    assert.equal(ctx.body.code, 12345);
  });

  it("凭证类异常默认 401/403", async () => {
    const a = await run(() => {
      throw new CredentialInvalidError("未登录");
    });
    assert.equal(a.status, 401);
    const b = await run(() => {
      throw new CredentialRefreshError("刷新失败");
    });
    assert.equal(b.status, 403);
  });

  it("限流 429 / 网络 502", async () => {
    const a = await run(() => {
      throw new RatelimitedError("慢一点");
    });
    assert.equal(a.status, 429);
    const b = await run(() => {
      throw new NetworkError("断网");
    });
    assert.equal(b.status, 502);
  });

  it("无状态领域异常与未知错误 -> 500", async () => {
    const a = await run(() => {
      throw new ApiDataError("数据坏了");
    });
    assert.equal(a.status, 500);
    const b = await run(() => {
      throw new Error("???");
    });
    assert.equal(b.status, 500);
    assert.equal(b.body.message, "???");
  });

  it("响应信封保持 { code, message, data }", async () => {
    const ctx = await run(() => {
      throw Object.assign(new Error("nope"), { statusCode: 404, data: { mid: "x" } });
    });
    assert.deepEqual(Object.keys(ctx.body).sort(), ["code", "data", "message"]);
    assert.deepEqual(ctx.body.data, { mid: "x" });
  });
});
