import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, getTokenFromRequest } from '@/lib/auth'
import { getExtFromFilename, getStoredFileAbsolutePath, getUploadsRootAbsolutePath } from '@/lib/uploads'
import { ensureOfficePdfPreview, getPdfInfo } from '@/lib/office-preview'

export const runtime = 'nodejs'

async function getUserFromRequest(request: NextRequest) {
  const token = getTokenFromRequest(request)
  if (!token) return null

  const payload = verifyToken(token)
  if (!payload) return null

  return payload
}

function isPreviewableOfficeExt(ext: string): boolean {
  return ext === 'ppt' || ext === 'pptx' || ext === 'xls' || ext === 'xlsx' || ext === 'pdf'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, fileId } = await params

    const file = await prisma.documentFile.findUnique({
      where: { id: fileId },
      include: {
        revision: { select: { documentId: true } },
      },
    })

    let storagePath: string | null = null
    let fileName: string | null = null
    if (file) {
      if (file.revision.documentId !== id) {
        return NextResponse.json({ error: 'File does not belong to this document' }, { status: 403 })
      }
      storagePath = file.storagePath
      fileName = file.fileName
    } else {
      const legacy = await prisma.documentVersion.findUnique({ where: { id: fileId } })
      if (!legacy) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }
      if (legacy.documentId !== id) {
        return NextResponse.json({ error: 'File does not belong to this document' }, { status: 403 })
      }
      storagePath = legacy.filePath
      fileName = legacy.fileName
    }

    const ext = getExtFromFilename(fileName ?? '')
    if (!isPreviewableOfficeExt(ext)) {
      return NextResponse.json({ error: 'Preview not available for this file type' }, { status: 400 })
    }

    const inputAbs = getStoredFileAbsolutePath(storagePath)
    const uploadsRootAbs = getUploadsRootAbsolutePath()
    const { pdfAbs } = await ensureOfficePdfPreview({
      inputAbs,
      uploadsRootAbs,
      fileId,
    })

    const info = await getPdfInfo({ pdfAbs })
    return NextResponse.json({ pages: info.pages })
  } catch (error) {
    console.error('Preview info error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

