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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const { id } = await params
    const document = await prisma.document.findUnique({
      where: { id },
      select: {
        referenceFilePath: true,
        referenceMimeType: true,
        referenceFileName: true
      }
    })

    if (!document || !document.referenceFilePath) {
      return new NextResponse('Reference document not found', { status: 404 })
    }

    // Convert relative path like /uploads/... to absolute path
    const absolutePath = join(process.cwd(), 'public', document.referenceFilePath)

    if (!existsSync(absolutePath)) {
       return new NextResponse('File not found', { status: 404 })
    }

    const fileBuffer = await readFile(absolutePath)

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': document.referenceMimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${document.referenceFileName}"`,
      },
    })
  } catch (error) {
    console.error('Download reference error:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}
