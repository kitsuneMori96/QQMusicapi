import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SongFileType,
  extForCode,
  parseSongFileType,
  resolveSongFileType,
} from "../src/modules/song_filetype.js";

describe("resolveSongFileType", () => {
  it("按 code 匹配", () => {
    assert.equal(resolveSongFileType("M800"), SongFileType.MP3_320);
    assert.equal(resolveSongFileType("F000"), SongFileType.FLAC);
  });

  it("按枚举名匹配(大小写不敏感)", () => {
    assert.equal(resolveSongFileType("MP3_128"), SongFileType.MP3_128);
    assert.equal(resolveSongFileType("flac"), SongFileType.FLAC);
    assert.equal(resolveSongFileType("acc_192"), SongFileType.ACC_192);
  });

  it("枚举实例原样返回", () => {
    assert.equal(resolveSongFileType(SongFileType.ATMOS_71), SongFileType.ATMOS_71);
  });

  it("未知输入返回 undefined", () => {
    assert.equal(resolveSongFileType("NOPE"), undefined);
    assert.equal(resolveSongFileType(""), undefined);
    assert.equal(resolveSongFileType(null), undefined);
    assert.equal(resolveSongFileType(123), undefined);
  });

  it("parseSongFileType 仅认 code", () => {
    assert.equal(parseSongFileType("M500"), SongFileType.MP3_128);
    assert.equal(parseSongFileType("MP3_128"), undefined);
  });
});

describe("extForCode", () => {
  it("code -> 扩展名", () => {
    assert.equal(extForCode("M800"), ".mp3");
    assert.equal(extForCode("F000"), ".flac");
    assert.equal(extForCode("AI00"), ".flac");
    assert.equal(extForCode("C600"), ".m4a");
    assert.equal(extForCode("TL01"), ".nac");
  });

  it("未知 code 返回 undefined", () => {
    assert.equal(extForCode("ZZZZ"), undefined);
    assert.equal(extForCode(undefined), undefined);
  });
});
