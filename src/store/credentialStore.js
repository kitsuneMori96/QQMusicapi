/**
 * 凭证文件存储.
 * 启动时从文件加载凭证, 后续每次更新都原子写入磁盘.
 * 文件格式: JSON, 与 Credential.toJSON() 输出一致.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { Credential } from "../models/credential.js";

export class CredentialStore {
  constructor(options = {}) {
    this._path = options.path
      ? isAbsolute(options.path)
        ? options.path
        : resolve(options.path)
      : resolve("./credential.json");
    this._credential = this._load();
    this._writeQueue = Promise.resolve();
  }

  /** 当前凭证的引用(外部修改不会自动落盘, 请使用 replace) */
  get credential() {
    return this._credential;
  }

  /** 凭证文件路径 */
  get path() {
    return this._path;
  }

  /** 替换当前凭证并原子写入文件 */
  async replace(credential) {
    const next = credential instanceof Credential ? credential : new Credential(credential);
    this._credential = next;
    await this._persist();
    return next;
  }

  /** 与现有凭证合并并写入 */
  async merge(patch) {
    const merged = new Credential({ ...this._credential.toJSON(), ...patch });
    this._credential = merged;
    await this._persist();
    return merged;
  }

  /** 清空凭证 (仅清除 musickey/musicid, 保留 device) */
  async clear() {
    this._credential = new Credential();
    await this._persist();
  }

  /** 返回脱敏后的凭证(用于前端展示, 隐藏 musickey/openid 等敏感字段) */
  toSafeJSON(includeSensitive = false) {
    const raw = this._credential.toJSON();
    if (includeSensitive) return raw;
    const safe = {};
    for (const [k, v] of Object.entries(raw)) {
      if (this._isSensitive(k)) {
        safe[k] = v ? "***" : "";
      } else {
        safe[k] = v;
      }
    }
    return safe;
  }

  _isSensitive(key) {
    return [
      "musickey",
      "openid",
      "unionid",
      "accessToken",
      "refreshToken",
      "refreshKey",
      "encryptUin",
    ].includes(key);
  }

  _load() {
    if (!existsSync(this._path)) return new Credential();
    try {
      const raw = JSON.parse(readFileSync(this._path, "utf-8"));
      return new Credential(raw);
    } catch {
      return new Credential();
    }
  }

  async _persist() {
    // 串行化写操作, 避免并发覆盖
    this._writeQueue = this._writeQueue.then(() => this._doWrite());
    await this._writeQueue;
  }

  _doWrite() {
    return new Promise((resolve, reject) => {
      try {
        const dir = dirname(this._path);
        if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
        const tmp = `${this._path}.tmp`;
        const json = JSON.stringify(this._credential.toJSON(), null, 2);
        writeFileSync(tmp, json, "utf-8");
        renameSync(tmp, this._path);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  }
}
