import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'

// Symmetric encryption for secrets stored at rest (OAuth tokens).
// Format: <iv-hex>:<authTag-hex>:<ciphertext-hex>, AES-256-GCM.
//
// The key comes from INTEGRATION_ENCRYPTION_KEY (any string; hashed to 32 bytes).
// In production set a strong, stable value — rotating it invalidates stored tokens.

function getKey(): Buffer {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY
  if (!raw) {
    throw new Error('INTEGRATION_ENCRYPTION_KEY is required to encrypt integration tokens')
  }
  // Derive a fixed 32-byte key regardless of input length.
  return createHash('sha256').update(raw).digest()
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':')
  if (!ivHex || !tagHex || !dataHex) throw new Error('Malformed encrypted secret')
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8')
}
