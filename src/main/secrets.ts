import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * Encrypted secret storage backed by Electron's `safeStorage`.
 *
 * Secrets are persisted to `<userData>/secrets.json` as a JSON map of
 * `name → base64(ciphertext)`. The plaintext never touches disk when
 * encryption is available.
 *
 * On platforms where `safeStorage.isEncryptionAvailable()` returns false
 * (e.g. Linux without a configured keyring such as libsecret/kwallet),
 * values are stored as base64 with NO real encryption. This is NOT secure
 * — a warning is logged on first use.
 */

type SecretMap = Record<string, string>

let cache: SecretMap | null = null
let warnedInsecure = false

function storeFilePath(): string {
  return join(app.getPath('userData'), 'secrets.json')
}

function readStore(): SecretMap {
  if (cache) return cache
  const path = storeFilePath()
  if (!existsSync(path)) {
    cache = {}
    return cache
  }
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    cache = parsed && typeof parsed === 'object' ? (parsed as SecretMap) : {}
  } catch (err) {
    console.warn('[secrets] Failed to read secrets store, starting fresh:', err)
    cache = {}
  }
  return cache
}

function writeStore(data: SecretMap): void {
  cache = data
  try {
    writeFileSync(storeFilePath(), JSON.stringify(data), { encoding: 'utf8', mode: 0o600 })
  } catch (err) {
    console.error('[secrets] Failed to persist secrets store:', err)
    throw err
  }
}

function warnInsecureOnce(): void {
  if (warnedInsecure) return
  warnedInsecure = true
  console.warn(
    '[secrets] safeStorage encryption is NOT available on this system. ' +
      'API keys will be base64-encoded but NOT encrypted. ' +
      'Install libsecret/gnome-keyring or kwallet to enable encryption.'
  )
}

function encrypt(plaintext: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(plaintext).toString('base64')
  }
  warnInsecureOnce()
  return Buffer.from(plaintext, 'utf8').toString('base64')
}

function decrypt(stored: string): string | null {
  if (!stored) return null
  try {
    const buf = Buffer.from(stored, 'base64')
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buf)
    }
    warnInsecureOnce()
    return buf.toString('utf8')
  } catch (err) {
    console.warn('[secrets] Failed to decrypt secret:', err)
    return null
  }
}

export function getSecret(name: string): string | null {
  const store = readStore()
  const entry = store[name]
  if (!entry) return null
  return decrypt(entry)
}

export function setSecret(name: string, value: string): void {
  const store = { ...readStore() }
  if (value === '') {
    delete store[name]
  } else {
    store[name] = encrypt(value)
  }
  writeStore(store)
}

export function hasSecret(name: string): boolean {
  const store = readStore()
  return typeof store[name] === 'string' && store[name].length > 0
}

export function clearSecret(name: string): void {
  const store = { ...readStore() }
  if (!(name in store)) return
  delete store[name]
  writeStore(store)
}
