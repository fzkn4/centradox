import { mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import crypto from 'crypto'

const UPLOADS_ROOT_DIRNAME = 'uploads'

export type AllowedDocumentExt = 'docx' | 'pdf' | 'pptx' | 'ppt' | 'xls' | 'xlsx'

const ALLOWED_DOCUMENT_EXTS: ReadonlySet<AllowedDocumentExt> = new Set([
  'docx',
  'pdf',
  'pptx',
  'ppt',
  'xls',
  'xlsx',
])

export function getExtFromFilename(filename: string): string {
  const idx = filename.lastIndexOf('.')
  if (idx === -1) return ''
  return filename.slice(idx + 1).toLowerCase()
}

export function assertAllowedDocumentFile(file: File): { ext: AllowedDocumentExt } {
  const ext = getExtFromFilename(file.name)
  if (!ALLOWED_DOCUMENT_EXTS.has(ext as AllowedDocumentExt)) {
    throw new Error('Only .docx, .pdf, .ppt/.pptx, and .xls/.xlsx files are allowed.')
  }
  return { ext: ext as AllowedDocumentExt }
}

export function getUploadsRootAbsolutePath(): string {
  return join(/*turbopackIgnore: true*/ process.cwd(), UPLOADS_ROOT_DIRNAME)
}

export async function ensureDirAbsolute(dirAbsolutePath: string): Promise<void> {
  if (!existsSync(dirAbsolutePath)) {
    await mkdir(dirAbsolutePath, { recursive: true })
  }
}

function safeOriginalName(filename: string): string {
  // Keep only a conservative set of characters for display; storage path is UUID-based.
  return filename.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 200)
}

export async function saveUploadedFile(params: {
  file: File
  relativeDir: string // under uploads/
}): Promise<{
  storagePath: string // relative under uploads/
  fileName: string
  fileSize: number
  mimeType: string
}> {
  const { file, relativeDir } = params
  const uploadsRoot = getUploadsRootAbsolutePath()
  const targetDirAbs = join(uploadsRoot, relativeDir)
  await ensureDirAbsolute(targetDirAbs)

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const ext = getExtFromFilename(file.name)
  const id = crypto.randomUUID()
  const storedFilename = ext ? `${id}.${ext}` : id

  const storagePath = join(relativeDir, storedFilename).replaceAll('\\', '/')
  const absPath = join(uploadsRoot, storagePath)
  await writeFile(absPath, buffer)

  return {
    storagePath,
    fileName: safeOriginalName(file.name),
    fileSize: buffer.length,
    mimeType: file.type || 'application/octet-stream',
  }
}

function normalizeStoragePath(input: string): string {
  // Force relative path under uploads/ to avoid path traversal and path.join root override.
  // Also normalize Windows separators.
  const normalized = input.replaceAll('\\', '/').replace(/^\/+/, '')
  if (normalized.includes('..')) {
    throw new Error('Invalid storage path')
  }
  return normalized
}

export async function readStoredFile(storagePath: string): Promise<Buffer> {
  const absPath = join(getUploadsRootAbsolutePath(), normalizeStoragePath(storagePath))
  return readFile(absPath)
}

export function getStoredFileAbsolutePath(storagePath: string): string {
  return join(getUploadsRootAbsolutePath(), normalizeStoragePath(storagePath))
}

export async function deleteStoredFile(storagePath: string): Promise<void> {
  const absPath = join(getUploadsRootAbsolutePath(), normalizeStoragePath(storagePath))
  try {
    await unlink(absPath)
  } catch {
    // ignore missing files
  }
}
