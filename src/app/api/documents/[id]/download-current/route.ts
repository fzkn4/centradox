import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, getTokenFromRequest } from '@/lib/auth'
import { readFile } from 'fs/promises'
import { join } from 'path'

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
        currentVersionId: true
      }
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (!document.currentVersionId) {
      return NextResponse.json({ error: 'No current version available' }, { status: 404 })
    }

    const version = await prisma.documentVersion.findUnique({
      where: { id: document.currentVersionId }
    })

    if (!version) {
      return NextResponse.json({ error: 'Current version not found' }, { status: 404 })
    }

    const fullPath = join(process.cwd(), 'public', version.filePath)

    try {
      const fileBuffer = await readFile(fullPath)

      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': version.mimeType,
          'Content-Disposition': `attachment; filename="${version.fileName}"`,
          'Content-Length': String(version.fileSize)
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
