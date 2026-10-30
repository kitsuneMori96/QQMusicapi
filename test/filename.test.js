import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeFileName,
  joinArtists,
  buildFileName,
  contentDisposition,
  mimeForExt,
} from "../src/utils/filename.js";

test("sanitizeFileName 去除 Windows 非法字符与控制符", () => {
  assert.equal(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j'), "a b c d e f g h i j");
  assert.equal(sanitizeFileName("  spaced.  "), "spaced");
  assert.equal(sanitizeFileName("...dots..."), "dots");
});

test("sanitizeFileName 空输入回落", () => {
  assert.equal(sanitizeFileName("", "Unknown"), "Unknown");
  assert.equal(sanitizeFileName("///", "X"), "X");
});

test("sanitizeFileName 按码点截断不撕裂 CJK/代理对", () => {
  const long = "汉".repeat(300);
  const out = sanitizeFileName(long);
  assert.equal(Array.from(out).length, 180);
  assert.ok(out.startsWith("汉") && out.endsWith("汉"));
});

test("joinArtists 用顿号连接并过滤空", () => {
  assert.equal(joinArtists(["A", "", "B"]), "A、B");
  assert.equal(joinArtists("Solo"), "Solo");
});

test("buildFileName 标题 - 歌手.ext", () => {
  assert.equal(
    buildFileName({ title: "十年", artists: ["陈奕迅"], ext: ".mp3" }),
    "十年 - 陈奕迅.mp3",
  );
  assert.equal(
    buildFileName({ title: "Song:Title", artists: ["A/B"], ext: ".flac" }),
    "Song Title - A B.flac",
  );
});

test("contentDisposition 含 ASCII 回退与 UTF-8 filename*", () => {
  const h = contentDisposition("十年 - 陈奕迅.mp3");
  assert.match(h, /^attachment; filename="/);
  assert.match(h, /filename\*=UTF-8''/);
  // UTF-8 部分应被百分号编码
  assert.ok(h.includes(encodeURIComponent("十年")));
});

test("mimeForExt 覆盖已知容器, 未知回落 octet-stream", () => {
  assert.equal(mimeForExt(".mp3"), "audio/mpeg");
  assert.equal(mimeForExt(".flac"), "audio/flac");
  assert.equal(mimeForExt(".m4a"), "audio/mp4");
  assert.equal(mimeForExt(".zzz"), "application/octet-stream");
});
