import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toErrorResponse } from "../src/http/errorHandler.ts";
import {
  ApiDataError,
  CredentialInvalidError,
  CredentialRefreshError,
  HTTPError,
  NetworkError,
  RatelimitedError,
} from "../src/exceptions.js";

const run = (err) => toErrorResponse(err);

describe("toErrorResponse", () => {
  it("显式 statusCode 4xx 原样透出", () => {
    const err = Object.assign(new Error("mid 必填"), { statusCode: 400 });
    const { status, body } = run(err);
    assert.equal(status, 400);
    assert.equal(body.code, 400);
    assert.equal(body.message, "mid 必填");
  });

  it("HTTPError 携带 statusCode 时透出", () => {
    const { status, body } = run(new HTTPError("上游炸了", { statusCode: 503, code: 12345 }));
    assert.equal(status, 503);
    assert.equal(body.code, 12345);
  });

  it("凭证类异常默认 401/403", () => {
    assert.equal(run(new CredentialInvalidError("未登录")).status, 401);
    assert.equal(run(new CredentialRefreshError("刷新失败")).status, 403);
  });

  it("限流 429 / 网络 502", () => {
    assert.equal(run(new RatelimitedError("慢一点")).status, 429);
    assert.equal(run(new NetworkError("断网")).status, 502);
  });

  it("无状态领域异常与未知错误 -> 500", () => {
    assert.equal(run(new ApiDataError("数据坏了")).status, 500);
    const { status, body } = run(new Error("???"));
    assert.equal(status, 500);
    assert.equal(body.message, "???");
  });

  it("字符串 code (如 FST_ERR_VALIDATION) 不污染数字错误码", () => {
    const err = Object.assign(new Error("bad"), { statusCode: 400, code: "FST_ERR_VALIDATION" });
    const { status, body } = run(err);
    assert.equal(status, 400);
    assert.equal(body.code, 400);
  });

  it("响应信封保持 { code, message, data }", () => {
    const { body } = run(
      Object.assign(new Error("nope"), { statusCode: 404, data: { mid: "x" } }),
    );
    assert.deepEqual(Object.keys(body).sort(), ["code", "data", "message"]);
    assert.deepEqual(body.data, { mid: "x" });
  });
});
