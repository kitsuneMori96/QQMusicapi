import { request } from './http'
import type {
  CredentialJSON,
  LoginStatusData,
  PhoneLoginData,
  QrCheckData,
  QrCodeData,
  SendAuthcodeData,
  UserSelfData,
} from './contracts'

/** GET /login/status */
export function getLoginStatus(): Promise<LoginStatusData> {
  return request<LoginStatusData>('/login/status', { timeoutMs: 8000 })
}

/** POST /login/qrcode —— 返回 base64 二维码 */
export function postQrCode(type: 'qq' | 'wx' | 'mobile' = 'qq'): Promise<QrCodeData> {
  return request<QrCodeData>('/login/qrcode', { method: 'POST', body: { type } })
}

/** POST /login/checkQrcode —— 0 DONE / 1 SCAN / 2 CONF / 3 REFUSE / 4 TIMEOUT / -1 OTHER */
export function postQrCheck(identifier: string, type: 'qq' | 'wx' = 'qq'): Promise<QrCheckData> {
  return request<QrCheckData>('/login/checkQrcode', {
    method: 'POST',
    body: { identifier, type },
    timeoutMs: 8000,
  })
}

/** POST /login/sendAuthcode */
export function postSendAuthcode(phone: string, countryCode = 86): Promise<SendAuthcodeData> {
  return request<SendAuthcodeData>('/login/sendAuthcode', {
    method: 'POST',
    body: { phone, countryCode },
  })
}

/** POST /login/phone */
export function postPhoneLogin(phone: string, code: string): Promise<PhoneLoginData> {
  return request<PhoneLoginData>('/login/phone', {
    method: 'POST',
    body: { phone, code },
  })
}

/** POST /login/refresh */
export function postRefreshCredential(): Promise<CredentialJSON> {
  return request<CredentialJSON>('/login/refresh', { method: 'POST', timeoutMs: 30_000 })
}

/** POST /login/logout */
export function postLogout(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/login/logout', { method: 'POST' })
}

/** GET /user/self —— 上游透传结构，字段靠前端宽松识别 */
export function getUserSelf(): Promise<UserSelfData> {
  return request<UserSelfData>('/user/self')
}
