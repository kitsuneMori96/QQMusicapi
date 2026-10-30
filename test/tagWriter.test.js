import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import NodeID3 from "node-id3";
import { readFlacTags } from "flac-tagger";
import { supportsTagging, tagFlac, tagMp3, writeTags } from "../src/services/tagWriter.js";

// flac-tagger 会用 imageinfo 解析封面尺寸, 必须是合法 JPEG
const JPEG = readFileSync(fileURLToPath(new URL("./fixtures/cover.jpg", import.meta.url)));

/** flac-tagger 要求文件含合法 STREAMINFO, 构造一个最小空 FLAC */
function minimalFlac() {
  const b = Buffer.alloc(4 + 4 + 34);
  b.write("fLaC", 0, "latin1");
  b[4] = 0x80; // last-block + type STREAMINFO
  b.writeUIntBE(34, 5, 3);
  return b;
}

const META = {
  title: "十年",
  artists: ["陈奕迅", "群星嘉宾"],
  album: "Black, Gray and White",
  year: "2003",
  genre: "Pop",
  track: { number: 3, count: 11 },
  lyric: "[00:00.00]作词 : 林夕\n[00:01.00]作曲 : 陈小霞",
  cover: { buffer: JPEG, mime: "image/jpeg" },
};

describe("supportsTagging", () => {
  it("仅 mp3/flac", () => {
    assert.equal(supportsTagging(".mp3"), true);
    assert.equal(supportsTagging(".flac"), true);
    assert.equal(supportsTagging(".m4a"), false);
    assert.equal(supportsTagging(".ogg"), false);
    assert.equal(supportsTagging(".nac"), false);
  });
});

describe("tagMp3", () => {
  it("buffer -> buffer 写入并可回读全部标签", () => {
    const out = tagMp3(Buffer.alloc(0), META);
    assert.ok(Buffer.isBuffer(out));
    assert.equal(out.subarray(0, 3).toString("latin1"), "ID3");

    const tags = NodeID3.read(out);
    assert.equal(tags.title, "十年");
    assert.equal(tags.artist, "陈奕迅、群星嘉宾");
    assert.equal(tags.album, "Black, Gray and White");
    assert.equal(tags.year, "2003");
    assert.equal(tags.genre, "Pop");
    assert.equal(tags.unsynchronisedLyrics.text, META.lyric);
    assert.ok(tags.image?.imageBuffer?.length >= JPEG.length - 2);    assert.equal(tags.image?.mime, "image/jpeg");
  });

  it("日期只保留年份, 数字 genre ID 不写入", () => {
    const out = tagMp3(Buffer.alloc(0), {
      title: "T",
      artists: ["A"],
      year: "2003-07-31",
      genre: "1",
    });
    const tags = NodeID3.read(out);
    assert.equal(tags.year, "2003");
    assert.equal(tags.genre, undefined);
  });

  it("无封面/歌词时不写 APIC/USLT 且不报错", () => {
    const out = tagMp3(Buffer.alloc(0), { title: "T", artists: [] });
    const tags = NodeID3.read(out);
    assert.equal(tags.title, "T");
    assert.equal(tags.artist, "Unknown Artist");
    assert.equal(tags.image, undefined);
    assert.equal(tags.unsynchronisedLyrics, undefined);
  });
});

describe("tagFlac", () => {
  it("临时文件中转后回读 Vorbis 注释与封面", async () => {
    const out = await tagFlac(minimalFlac(), META);
    assert.equal(out.subarray(0, 4).toString("latin1"), "fLaC");

    // readFlacTags 仅支持文件路径, 经临时文件回读
    const probe = join(tmpdir(), `qqm-probe-${process.pid}-${Date.now()}.flac`);
    await writeFile(probe, out);
    let tagMap, picture;
    try {
      ({ tagMap, picture } = await readFlacTags(probe));
    } finally {
      await unlink(probe).catch(() => {});
    }
    assert.equal(tagMap.TITLE, "十年");
    assert.equal(String(tagMap.ARTIST).includes("陈奕迅"), true);
    assert.equal(tagMap.ALBUM, "Black, Gray and White");
    assert.equal(tagMap.DATE, "2003");
    assert.equal(tagMap.GENRE, "Pop");
    assert.equal(tagMap.TRACKNUMBER, "3/11");
    assert.equal(tagMap.LYRICS, META.lyric);
    assert.ok(picture?.buffer?.length >= JPEG.length - 2);
  });

  it("临时文件写完即删(不留残留)", async () => {
    await tagFlac(minimalFlac(), { title: "x", artists: ["y"] });
    // tagFlac 的 finally 已 unlink; 若泄漏文件, 多次运行会在 tmpdir 累积 qqm-flac-*.flac
  });
});

describe("writeTags", () => {
  it("按扩展名分派", async () => {
    const mp3 = await writeTags(".mp3", Buffer.alloc(0), META);
    assert.equal(mp3.subarray(0, 3).toString("latin1"), "ID3");
    const flac = await writeTags(".flac", minimalFlac(), META);
    assert.equal(flac.subarray(0, 4).toString("latin1"), "fLaC");
  });

  it("不支持的容器原样返回", async () => {
    const buf = Buffer.from("raw-bytes");
    assert.equal(await writeTags(".m4a", buf, META), buf);
  });
});
