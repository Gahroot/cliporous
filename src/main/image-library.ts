/**
 * Image Library — persistent labeled cache for AI-generated and stock images.
 *
 * Storage layout (under app.getPath('userData')/image-library/):
 *   blobs/<sha256>.png   — image binary blobs (content-addressed)
 *   library.sqlite       — better-sqlite3 metadata database
 *
 * All operations are synchronous (better-sqlite3 API). Multi-row writes are
 * wrapped in transactions. Image lookup supports both exact match and
 * semantic similarity (cosine over pre-normalized embeddings).
 */

import Database from 'better-sqlite3'
import type { Database as DatabaseType, Statement } from 'better-sqlite3'
import { app } from 'electron'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { log } from './logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImageSource = 'gemini' | 'pexels' | 'fal'

export interface AssetRow {
  id: number
  sha256: string
  path: string
  prompt: string
  normalized_prompt: string
  keyword: string
  style: string | null
  aspect_ratio: string
  source: ImageSource
  model: string | null
  width: number
  height: number
  embedding: Float32Array | null
  tags: string[]
  created_at: number
  last_used_at: number
  use_count: number
  favorite: boolean
}

export interface LookupExactInput {
  keyword: string
  style?: string | null
  aspectRatio: string
  source: ImageSource
  prompt?: string
}

export interface LookupSemanticInput {
  keyword: string
  style?: string | null
  aspectRatio: string
  source: ImageSource
  queryEmbedding: Float32Array
  threshold?: number
}

export interface SaveAssetInput {
  buffer: Buffer
  prompt: string
  keyword: string
  style?: string | null
  aspectRatio: string
  source: ImageSource
  model?: string | null
  width: number
  height: number
  embedding?: Float32Array | null
  tags?: string[]
}

export interface ListAssetsOptions {
  limit?: number
  offset?: number
  sort?: 'recent' | 'oldest' | 'most_used' | 'favorites_first'
}

export interface SearchAssetsOptions {
  query?: string
  tags?: string[]
}

export interface LibraryStats {
  count: number
  totalBytes: number
  favorites: number
}

export interface EvictResult {
  evicted: number
  freedBytes: number
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let db: DatabaseType | null = null
let rootDir = ''
let blobsDir = ''
let dbPath = ''
let initialized = false

// Prepared statements (lazily set after init)
let stmtSelectBySha: Statement | null = null
let stmtSelectExactByKey: Statement | null = null
let stmtSelectExactByPrompt: Statement | null = null
let stmtTouch: Statement | null = null
let stmtInsert: Statement | null = null
let stmtSelectById: Statement | null = null
let stmtDelete: Statement | null = null
let stmtSetTags: Statement | null = null
let stmtSetFavorite: Statement | null = null
let stmtCount: Statement | null = null
let stmtCountFavorites: Statement | null = null
let stmtSelectSemanticPool: Statement | null = null
let stmtSelectEvictionCandidates: Statement | null = null

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureInit(): DatabaseType {
  if (!db || !initialized) {
    throw new Error('[ImageLibrary] initImageLibrary() must be called before use')
  }
  return db
}

function normalizePrompt(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

function embeddingToBuffer(emb: Float32Array | null | undefined): Buffer | null {
  if (!emb || emb.length === 0) return null
  // Copy to a fresh ArrayBuffer to avoid shared-buffer surprises.
  const f32 = emb instanceof Float32Array ? emb : new Float32Array(emb)
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength)
}

function bufferToEmbedding(buf: Buffer | null | undefined): Float32Array | null {
  if (!buf || buf.byteLength === 0) return null
  // Copy bytes into a fresh ArrayBuffer to avoid alignment / offset issues
  // when slicing from Node's pooled Buffers.
  const copy = new Uint8Array(buf.byteLength)
  copy.set(buf)
  return new Float32Array(copy.buffer)
}

interface AssetRowRaw {
  id: number
  sha256: string
  path: string
  prompt: string
  normalized_prompt: string
  keyword: string
  style: string | null
  aspect_ratio: string
  source: string
  model: string | null
  width: number
  height: number
  embedding: Buffer | null
  tags: string | null
  created_at: number
  last_used_at: number
  use_count: number
  favorite: number
}

function rowToAsset(raw: AssetRowRaw | undefined): AssetRow | null {
  if (!raw) return null
  let tags: string[] = []
  if (raw.tags) {
    try {
      const parsed = JSON.parse(raw.tags) as unknown
      if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string')
    } catch {
      tags = []
    }
  }
  return {
    id: raw.id,
    sha256: raw.sha256,
    path: raw.path,
    prompt: raw.prompt,
    normalized_prompt: raw.normalized_prompt,
    keyword: raw.keyword,
    style: raw.style,
    aspect_ratio: raw.aspect_ratio,
    source: raw.source as ImageSource,
    model: raw.model,
    width: raw.width,
    height: raw.height,
    embedding: bufferToEmbedding(raw.embedding),
    tags,
    created_at: raw.created_at,
    last_used_at: raw.last_used_at,
    use_count: raw.use_count,
    favorite: raw.favorite === 1
  }
}

/**
 * Cosine similarity for two pre-normalized vectors. Reduces to a plain
 * dot product. Returns 0 when lengths mismatch or either is empty.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i]
  }
  return sum
}

// ---------------------------------------------------------------------------
// Schema / migrations
// ---------------------------------------------------------------------------

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sha256 TEXT UNIQUE NOT NULL,
    path TEXT NOT NULL,
    prompt TEXT NOT NULL,
    normalized_prompt TEXT NOT NULL,
    keyword TEXT NOT NULL,
    style TEXT,
    aspect_ratio TEXT NOT NULL,
    source TEXT NOT NULL,
    model TEXT,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    embedding BLOB,
    tags TEXT,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL,
    use_count INTEGER NOT NULL DEFAULT 1,
    favorite INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_assets_sha256 ON assets(sha256);
  CREATE INDEX IF NOT EXISTS idx_assets_normalized_prompt ON assets(normalized_prompt);
  CREATE INDEX IF NOT EXISTS idx_assets_keyword ON assets(keyword);
  CREATE INDEX IF NOT EXISTS idx_assets_last_used_at ON assets(last_used_at);
  CREATE INDEX IF NOT EXISTS idx_assets_favorite ON assets(favorite);
`

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialise the image library. Creates dirs, opens the DB, runs migrations.
 * Idempotent — safe to call multiple times. Must be called once at app start.
 */
export function initImageLibrary(): void {
  if (initialized) return

  try {
    rootDir = join(app.getPath('userData'), 'image-library')
    blobsDir = join(rootDir, 'blobs')
    dbPath = join(rootDir, 'library.sqlite')

    if (!existsSync(rootDir)) mkdirSync(rootDir, { recursive: true })
    if (!existsSync(blobsDir)) mkdirSync(blobsDir, { recursive: true })

    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('foreign_keys = ON')

    db.exec(SCHEMA_SQL)

    // Prepare frequently used statements
    stmtSelectBySha = db.prepare('SELECT * FROM assets WHERE sha256 = ?')
    stmtSelectExactByKey = db.prepare(
      `SELECT * FROM assets
       WHERE keyword = @keyword
         AND IFNULL(style, '') = IFNULL(@style, '')
         AND aspect_ratio = @aspect_ratio
         AND source = @source
       ORDER BY last_used_at DESC
       LIMIT 1`
    )
    stmtSelectExactByPrompt = db.prepare(
      `SELECT * FROM assets
       WHERE normalized_prompt = @normalized_prompt
         AND aspect_ratio = @aspect_ratio
         AND source = @source
       ORDER BY last_used_at DESC
       LIMIT 1`
    )
    stmtTouch = db.prepare(
      'UPDATE assets SET last_used_at = @now, use_count = use_count + 1 WHERE id = @id'
    )
    stmtInsert = db.prepare(
      `INSERT INTO assets (
         sha256, path, prompt, normalized_prompt, keyword, style,
         aspect_ratio, source, model, width, height, embedding, tags,
         created_at, last_used_at, use_count, favorite
       ) VALUES (
         @sha256, @path, @prompt, @normalized_prompt, @keyword, @style,
         @aspect_ratio, @source, @model, @width, @height, @embedding, @tags,
         @created_at, @last_used_at, 1, 0
       )`
    )
    stmtSelectById = db.prepare('SELECT * FROM assets WHERE id = ?')
    stmtDelete = db.prepare('DELETE FROM assets WHERE id = ?')
    stmtSetTags = db.prepare('UPDATE assets SET tags = @tags WHERE id = @id')
    stmtSetFavorite = db.prepare('UPDATE assets SET favorite = @favorite WHERE id = @id')
    stmtCount = db.prepare('SELECT COUNT(*) AS c FROM assets')
    stmtCountFavorites = db.prepare('SELECT COUNT(*) AS c FROM assets WHERE favorite = 1')
    stmtSelectSemanticPool = db.prepare(
      `SELECT * FROM assets
       WHERE IFNULL(style, '') = IFNULL(@style, '')
         AND aspect_ratio = @aspect_ratio
         AND source = @source
         AND embedding IS NOT NULL`
    )
    stmtSelectEvictionCandidates = db.prepare(
      `SELECT id, path FROM assets
       WHERE favorite = 0
       ORDER BY last_used_at ASC`
    )

    initialized = true
    log('info', 'ImageLibrary', `Initialized at ${rootDir}`)
  } catch (err) {
    log('error', 'ImageLibrary', `Init failed: ${(err as Error).message}`)
    throw err
  }
}

/**
 * Exact lookup. Matches first on (keyword + style + aspect_ratio + source);
 * if a `prompt` is supplied, also tries an exact normalized_prompt match.
 * Touches the hit row's last_used_at / use_count.
 */
export function lookupExact(input: LookupExactInput): AssetRow | null {
  ensureInit()
  const style = input.style ?? null

  // Try keyword-tuple match first.
  if (stmtSelectExactByKey && stmtTouch) {
    const raw = stmtSelectExactByKey.get({
      keyword: input.keyword,
      style,
      aspect_ratio: input.aspectRatio,
      source: input.source
    }) as AssetRowRaw | undefined
    if (raw) {
      stmtTouch.run({ now: Date.now(), id: raw.id })
      return rowToAsset(raw)
    }
  }

  // Fallback: exact prompt match (if caller supplied a prompt).
  if (input.prompt && stmtSelectExactByPrompt && stmtTouch) {
    const raw = stmtSelectExactByPrompt.get({
      normalized_prompt: normalizePrompt(input.prompt),
      aspect_ratio: input.aspectRatio,
      source: input.source
    }) as AssetRowRaw | undefined
    if (raw) {
      stmtTouch.run({ now: Date.now(), id: raw.id })
      return rowToAsset(raw)
    }
  }

  return null
}

/**
 * Semantic lookup. Filters by style+aspect_ratio+source, computes cosine
 * similarity against each row's embedding, returns the best match if its
 * score ≥ threshold. Touches the hit row's last_used_at / use_count.
 */
export function lookupSemantic(
  input: LookupSemanticInput
): { row: AssetRow; score: number } | null {
  ensureInit()
  const threshold = input.threshold ?? 0.85
  if (!stmtSelectSemanticPool || !stmtTouch) return null
  if (!input.queryEmbedding || input.queryEmbedding.length === 0) return null

  const rows = stmtSelectSemanticPool.all({
    style: input.style ?? null,
    aspect_ratio: input.aspectRatio,
    source: input.source
  }) as AssetRowRaw[]

  let bestScore = -Infinity
  let bestRaw: AssetRowRaw | null = null
  for (const raw of rows) {
    const emb = bufferToEmbedding(raw.embedding)
    if (!emb) continue
    const score = cosineSimilarity(input.queryEmbedding, emb)
    if (score > bestScore) {
      bestScore = score
      bestRaw = raw
    }
  }

  if (bestRaw && bestScore >= threshold) {
    stmtTouch.run({ now: Date.now(), id: bestRaw.id })
    const asset = rowToAsset(bestRaw)
    if (asset) return { row: asset, score: bestScore }
  }
  return null
}

/**
 * Save an asset. Hashes the buffer, writes a blob to disk if not already
 * present, and inserts the metadata row. If a row with the same sha256
 * already exists, returns it unchanged (does not overwrite metadata).
 */
export function saveAsset(input: SaveAssetInput): AssetRow {
  ensureInit()
  if (!stmtSelectBySha || !stmtInsert) throw new Error('[ImageLibrary] Not initialized')

  const hash = sha256(input.buffer)

  // Existing row? Return it (idempotent).
  const existingRaw = stmtSelectBySha.get(hash) as AssetRowRaw | undefined
  if (existingRaw) {
    const asset = rowToAsset(existingRaw)
    if (asset) return asset
  }

  const blobPath = join(blobsDir, `${hash}.png`)
  if (!existsSync(blobPath)) {
    try {
      writeFileSync(blobPath, input.buffer)
    } catch (err) {
      log('error', 'ImageLibrary', `Failed to write blob ${hash}: ${(err as Error).message}`)
      throw err
    }
  }

  const now = Date.now()
  const params = {
    sha256: hash,
    path: blobPath,
    prompt: input.prompt,
    normalized_prompt: normalizePrompt(input.prompt),
    keyword: input.keyword,
    style: input.style ?? null,
    aspect_ratio: input.aspectRatio,
    source: input.source,
    model: input.model ?? null,
    width: input.width,
    height: input.height,
    embedding: embeddingToBuffer(input.embedding),
    tags: JSON.stringify(input.tags ?? []),
    created_at: now,
    last_used_at: now
  }

  try {
    const info = stmtInsert.run(params)
    const insertedRaw = (stmtSelectById?.get(info.lastInsertRowid) as AssetRowRaw | undefined)
    const asset = rowToAsset(insertedRaw)
    if (!asset) throw new Error('Failed to read back inserted row')
    return asset
  } catch (err) {
    // Race: another writer inserted the same sha256 between our check and
    // insert. Re-read and return the existing row.
    const raceRaw = stmtSelectBySha.get(hash) as AssetRowRaw | undefined
    const asset = rowToAsset(raceRaw)
    if (asset) return asset
    log('error', 'ImageLibrary', `saveAsset failed: ${(err as Error).message}`)
    throw err
  }
}

/**
 * Touch an asset — bump last_used_at to now, increment use_count.
 */
export function touchAsset(id: number): void {
  ensureInit()
  if (!stmtTouch) return
  stmtTouch.run({ now: Date.now(), id })
}

/**
 * List assets, optionally paginated and sorted.
 */
export function listAssets(options: ListAssetsOptions = {}): AssetRow[] {
  const database = ensureInit()
  const limit = Math.max(0, options.limit ?? 100)
  const offset = Math.max(0, options.offset ?? 0)
  const sort = options.sort ?? 'recent'

  let orderBy: string
  switch (sort) {
    case 'oldest':
      orderBy = 'created_at ASC'
      break
    case 'most_used':
      orderBy = 'use_count DESC, last_used_at DESC'
      break
    case 'favorites_first':
      orderBy = 'favorite DESC, last_used_at DESC'
      break
    case 'recent':
    default:
      orderBy = 'last_used_at DESC'
      break
  }

  const sql = `SELECT * FROM assets ORDER BY ${orderBy} LIMIT ? OFFSET ?`
  const rows = database.prepare(sql).all(limit, offset) as AssetRowRaw[]
  return rows.map((r) => rowToAsset(r)).filter((a): a is AssetRow => a !== null)
}

/**
 * Substring search over normalized_prompt / keyword / tags. Optionally
 * filters to rows whose tag array contains any of `tags`.
 */
export function searchAssets(options: SearchAssetsOptions): AssetRow[] {
  const database = ensureInit()
  const clauses: string[] = []
  const params: unknown[] = []

  if (options.query && options.query.trim()) {
    const like = `%${options.query.trim().toLowerCase()}%`
    clauses.push('(normalized_prompt LIKE ? OR keyword LIKE ? OR LOWER(IFNULL(tags, "")) LIKE ?)')
    params.push(like, like, like)
  }

  if (options.tags && options.tags.length > 0) {
    const tagClauses = options.tags.map(() => 'LOWER(IFNULL(tags, "")) LIKE ?').join(' OR ')
    clauses.push(`(${tagClauses})`)
    for (const t of options.tags) {
      params.push(`%"${t.toLowerCase()}"%`)
    }
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const sql = `SELECT * FROM assets ${where} ORDER BY last_used_at DESC LIMIT 500`
  const rows = database.prepare(sql).all(...params) as AssetRowRaw[]
  return rows.map((r) => rowToAsset(r)).filter((a): a is AssetRow => a !== null)
}

/**
 * Replace an asset's tags.
 */
export function setTags(id: number, tags: string[]): void {
  ensureInit()
  if (!stmtSetTags) return
  stmtSetTags.run({ id, tags: JSON.stringify(tags) })
}

/**
 * Toggle an asset's favorite flag.
 */
export function setFavorite(id: number, favorite: boolean): void {
  ensureInit()
  if (!stmtSetFavorite) return
  stmtSetFavorite.run({ id, favorite: favorite ? 1 : 0 })
}

/**
 * Delete an asset: removes the DB row and its blob file. Other rows
 * referencing the same sha256 would be orphaned, but content-addressed
 * blobs share a one-row-per-sha invariant so this is safe.
 */
export function deleteAsset(id: number): void {
  const database = ensureInit()
  if (!stmtSelectById || !stmtDelete) return

  const raw = stmtSelectById.get(id) as AssetRowRaw | undefined
  if (!raw) return

  const tx = database.transaction(() => {
    stmtDelete!.run(id)
  })
  tx()

  if (raw.path && existsSync(raw.path)) {
    try {
      unlinkSync(raw.path)
    } catch (err) {
      log('warn', 'ImageLibrary', `Failed to delete blob ${raw.path}: ${(err as Error).message}`)
    }
  }
}

/**
 * Evict assets when total blob size exceeds maxBytes. Deletes oldest-by-
 * last_used_at non-favorite rows until under the cap. Favorites are never
 * deleted.
 */
export function evictIfNeeded(
  options: { maxBytes?: number } = {}
): EvictResult {
  ensureInit()
  if (!stmtSelectEvictionCandidates) return { evicted: 0, freedBytes: 0 }

  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024 * 1024 // 2 GiB
  const stats = getLibraryStats()
  if (stats.totalBytes <= maxBytes) return { evicted: 0, freedBytes: 0 }

  const candidates = stmtSelectEvictionCandidates.all() as Array<{ id: number; path: string }>
  let total = stats.totalBytes
  let evicted = 0
  let freed = 0

  for (const cand of candidates) {
    if (total <= maxBytes) break
    let size = 0
    try {
      if (existsSync(cand.path)) size = statSync(cand.path).size
    } catch {
      size = 0
    }
    try {
      deleteAsset(cand.id)
      evicted += 1
      freed += size
      total -= size
    } catch (err) {
      log('warn', 'ImageLibrary', `Eviction failed for id=${cand.id}: ${(err as Error).message}`)
    }
  }

  if (evicted > 0) {
    log(
      'info',
      'ImageLibrary',
      `Evicted ${evicted} asset(s), freed ${(freed / (1024 * 1024)).toFixed(1)} MiB`
    )
  }
  return { evicted, freedBytes: freed }
}

/**
 * Aggregate stats: row count, sum of blob byte sizes on disk, favorite count.
 */
export function getLibraryStats(): LibraryStats {
  const database = ensureInit()
  const countRow = stmtCount!.get() as { c: number }
  const favRow = stmtCountFavorites!.get() as { c: number }

  // Sum sizes from disk so we reflect ground truth even if rows / blobs
  // diverged due to manual edits or crashes.
  const rows = database.prepare('SELECT path FROM assets').all() as Array<{ path: string }>
  let totalBytes = 0
  for (const r of rows) {
    try {
      if (r.path && existsSync(r.path)) totalBytes += statSync(r.path).size
    } catch {
      // ignore individual stat failures
    }
  }

  return {
    count: countRow.c,
    totalBytes,
    favorites: favRow.c
  }
}
