import { decrypt, encrypt } from './crypto'

let key: Buffer | undefined

export function setSecretKey(k: Buffer): void {
  key = k
}

function need(): Buffer {
  if (!key) throw new Error('Secret key not initialised')
  return key
}

export const encryptSecret = (plain: string): string => encrypt(plain, need())
export const decryptSecret = (payload: string): string => decrypt(payload, need())
