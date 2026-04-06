import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, getTokenFromRequest } from '@/lib/auth'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

async function getUserFromRequest(request: NextRequest) {
  const token = getTokenFromRequest(request)
  if (!token) return null

  const payload = verifyToken(token)
  if (!payload) return null

  return payload
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; refFileId: string }> }
) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const { id, refFileId } = await params

    const refFile = await prisma.documentReferenceFile.findUnique({
      where: { id: refFileId }
    })

    if (!refFile || refFile.documentId !== id) {
      return new NextResponse('Reference file not found', { status: 404 })
    }

    const absolutePath = join(process.cwd(), 'public', refFile.filePath)

    if (!existsSync(absolutePath)) {
       return new NextResponse('File not found', { status: 404 })
    }

    const fileBuffer = await readFile(absolutePath)

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': refFile.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${refFile.fileName}"`,
      },
    })
  } catch (error) {
    console.error('Download reference error:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}
