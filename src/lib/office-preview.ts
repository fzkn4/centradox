import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { basename, dirname, extname, join } from 'path'
import crypto from 'crypto'

export interface PdfInfo {
  pages: number
}

interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

async function runCommand(params: {
  cmd: string
  args: string[]
  cwd?: string
  timeoutMs?: number
}): Promise<RunResult> {
  const { cmd, args, cwd, timeoutMs = 120_000 } = params

  return new Promise<RunResult>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd })
    let stdout = ''
    let stderr = ''

    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`Command timed out: ${cmd}`))
    }, timeoutMs)

    child.stdout.on('data', (d) => {
      stdout += String(d)
    })
    child.stderr.on('data', (d) => {
      stderr += String(d)
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    child.on('close', (code) => {
      clearTimeout(timeout)
      resolve({ code, stdout, stderr })
    })
  })
}

export function getOfficePreviewCachePaths(params: { uploadsRootAbs: string; fileId: string }): {
  pdfAbs: string
  pngDirAbs: string
} {
  const { uploadsRootAbs, fileId } = params
  const previewsRootAbs = join(uploadsRootAbs, 'previews')
  return {
    pdfAbs: join(previewsRootAbs, 'pdf', `${fileId}.pdf`),
    pngDirAbs: join(previewsRootAbs, 'png'),
  }
}

export async function ensureOfficePdfPreview(params: {
  inputAbs: string
  uploadsRootAbs: string
  fileId: string
}): Promise<{ pdfAbs: string }> {
  const { inputAbs, uploadsRootAbs, fileId } = params
  const { pdfAbs } = getOfficePreviewCachePaths({ uploadsRootAbs, fileId })

  if (existsSync(pdfAbs)) return { pdfAbs }

  await mkdir(dirname(pdfAbs), { recursive: true })

  const tmpDirAbs = join(uploadsRootAbs, 'previews', 'tmp', crypto.randomUUID())
  await mkdir(tmpDirAbs, { recursive: true })

  const inputBase = basename(inputAbs, extname(inputAbs))
  const expectedTmpPdfAbs = join(tmpDirAbs, `${inputBase}.pdf`)

  try {
    const result = await runCommand({
      cmd: 'soffice',
      args: [
        '--headless',
        '--nologo',
        '--nofirststartwizard',
        '--norestore',
        '--nolockcheck',
        '--convert-to',
        'pdf',
        '--outdir',
        tmpDirAbs,
        inputAbs,
      ],
      timeoutMs: 180_000,
    })

    if (result.code !== 0) {
      throw new Error(`LibreOffice conversion failed: ${result.stderr || result.stdout}`)
    }

    if (!existsSync(expectedTmpPdfAbs)) {
      throw new Error('LibreOffice conversion did not produce a PDF')
    }

    const bytes = await readFile(expectedTmpPdfAbs)
    await writeFile(pdfAbs, bytes)

    return { pdfAbs }
  } finally {
    await rm(tmpDirAbs, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function getPdfInfo(params: { pdfAbs: string }): Promise<PdfInfo> {
  const { pdfAbs } = params
  const result = await runCommand({
    cmd: 'pdfinfo',
    args: [pdfAbs],
    timeoutMs: 30_000,
  })
  if (result.code !== 0) {
    throw new Error(`pdfinfo failed: ${result.stderr || result.stdout}`)
  }

  const match = result.stdout.match(/^\s*Pages:\s+(\d+)\s*$/m)
  const pages = match ? Number(match[1]) : NaN
  if (!Number.isFinite(pages) || pages <= 0) {
    throw new Error('Unable to determine PDF page count')
  }

  return { pages }
}

export async function ensurePdfPagePng(params: {
  pdfAbs: string
  uploadsRootAbs: string
  fileId: string
  page: number
}): Promise<{ pngAbs: string }> {
  const { pdfAbs, uploadsRootAbs, fileId, page } = params
  const { pngDirAbs } = getOfficePreviewCachePaths({ uploadsRootAbs, fileId })

  await mkdir(pngDirAbs, { recursive: true })

  const prefixAbs = join(pngDirAbs, `${fileId}-p${page}`)
  const pngAbs = `${prefixAbs}.png`
  if (existsSync(pngAbs)) return { pngAbs }

  const result = await runCommand({
    cmd: 'pdftoppm',
    args: [
      '-png',
      '-f',
      String(page),
      '-l',
      String(page),
      '-singlefile',
      pdfAbs,
      prefixAbs,
    ],
    timeoutMs: 60_000,
  })

  if (result.code !== 0) {
    throw new Error(`pdftoppm failed: ${result.stderr || result.stdout}`)
  }
  if (!existsSync(pngAbs)) {
    throw new Error('pdftoppm did not produce a PNG')
  }

  return { pngAbs }
}
