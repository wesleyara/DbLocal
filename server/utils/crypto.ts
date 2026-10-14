import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const VERSION = 'v1'

export function loadSecretKey(dataDir: string, env: NodeJS.ProcessEnv = process.env): Buffer {
  if (env.DBLOCAL_SECRET) return createHash('sha256').update(env.DBLOCAL_SECRET).digest()
  const file = join(dataDir, 'secret.key')
  if (existsSync(file)) return Buffer.from(readFileSync(file, 'utf8').trim(), 'hex')
  const key = randomBytes(32)
  writeFileSync(file, key.toString('hex'), { mode: 0o600 })
  chmodSync(file, 0o600)
  return key
}

export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':')
}

export function decrypt(payload: string, key: Buffer): string {
  const [version, iv, tag, data] = payload.split(':')
  if (version !== VERSION || !iv || !tag || data === undefined) {
    throw new Error('Unsupported ciphertext format')
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
    'utf8',
  )
}
