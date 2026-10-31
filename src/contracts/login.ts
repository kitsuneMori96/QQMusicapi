/**
 * 登录域契约.
 */

import type { UnknownRecord } from "./common.ts";

export type QrLoginTypeValue = "qq" | "wx" | "mobile";

/** 二维码事件: 0=完成 1=已扫描 2=已确认 3=拒绝 4=超时 -1=其他 */
export const QrEvent = {
  DONE: 0,
  SCAN: 1,
  CONF: 2,
  REFUSE: 3,
  TIMEOUT: 4,
  OTHER: -1,
} as const;

export interface CredentialJSON extends UnknownRecord {
  musicid?: number | string;
  musickey?: string;
}

/** GET /login/status */
export interface LoginStatusData {
  loggedIn: boolean;
  expired: boolean;
  musicid: string | null;
  /** 凭证文件路径(便于排查) */
  file: string;
}

/** GET /login/credential */
export interface LoginCredentialData {
  credential: CredentialJSON;
  file: string;
}

/** POST /login/qrcode */
export interface QrCodeData {
  type: QrLoginTypeValue;
  mime: string;
  identifier: string;
  /** 二维码图片 base64(无 data URL 前缀) */
  data: string;
}

/** POST /login/checkQrcode */
export interface QrCheckData {
  event: number;
  /** 登录成功时同时写入凭证存储 */
  credential: CredentialJSON | null;
}

/** POST /login/sendAuthcode */
export type SendAuthcodeData =
  | { event: "CAPTCHA"; info?: string }
  | { event: "FREQUENCY" }
  | { event: "SEND" };

/** POST /login/phone 返回保存后的凭证 */
export type PhoneLoginData = CredentialJSON;

export interface QrCodeBody {
  type?: QrLoginTypeValue;
}

export interface QrCheckBody {
  identifier: string;
  type?: "qq" | "wx";
}

export interface SendAuthcodeBody {
  /** 字符串视为已加密手机号 */
  phone: string | number;
  countryCode?: number;
}

export interface PhoneLoginBody {
  phone: string | number;
  code: string;
}
