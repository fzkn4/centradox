import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, getTokenFromRequest } from '@/lib/auth'
import { readStoredFile } from '@/lib/uploads'

async function getUserFromRequest(request: NextRequest) {
  const token = getTokenFromRequest(request)
  if (!token) return null

  const payload = verifyToken(token)
  if (!payload) return null

  return payload
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const document = await prisma.document.findUnique({
      where: { id },
      select: {
        currentRevisionId: true,
      }
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (!document.currentRevisionId) {
      // Legacy fallback: serve most recent DocumentVersion (pre revisions).
      const latestVersion = await prisma.documentVersion.findFirst({
        where: { documentId: id },
        orderBy: { versionNumber: 'desc' },
      })
      if (!latestVersion) {
        return NextResponse.json({ error: 'No current revision available' }, { status: 404 })
      }

      const fileBuffer = await readStoredFile(latestVersion.filePath)
      const body = new Uint8Array(fileBuffer)
      return new NextResponse(body, {
        headers: {
          'Content-Type': latestVersion.mimeType,
          'Content-Disposition': `attachment; filename="${latestVersion.fileName}"`,
          'Content-Length': String(latestVersion.fileSize),
        },
      })
    }

    const revision = await prisma.documentRevision.findUnique({
      where: { id: document.currentRevisionId },
      include: {
        files: { orderBy: { createdAt: 'asc' } },
      },
    })

    if (!revision) {
      return NextResponse.json({ error: 'Current revision not found' }, { status: 404 })
    }

    const primary = revision.files.find((f: any) => f.isPrimary) ?? revision.files[0]
    if (!primary) {
      return NextResponse.json({ error: 'No files found in current revision' }, { status: 404 })
    }

    try {
      const fileBuffer = await readStoredFile(primary.storagePath)
      const body = new Uint8Array(fileBuffer)

      return new NextResponse(body, {
        headers: {
          'Content-Type': primary.mimeType,
          'Content-Disposition': `attachment; filename="${primary.fileName}"`,
          'Content-Length': String(primary.fileSize)
        }
      })
    } catch (error) {
      console.error('File not found:', error)
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
  } catch (error) {
    console.error('Download current version error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
