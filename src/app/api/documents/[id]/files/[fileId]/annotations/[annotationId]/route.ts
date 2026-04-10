import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromRequest, verifyToken } from '@/lib/auth'
import { deleteStoredFile } from '@/lib/uploads'

async function getUserFromRequest(request: NextRequest) {
  const token = getTokenFromRequest(request)
  if (!token) return null
  const payload = verifyToken(token)
  if (!payload) return null
  return payload
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string; annotationId: string }> }
) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, fileId, annotationId } = await params

    const file = await prisma.documentFile.findUnique({
      where: { id: fileId },
      include: { revision: { select: { documentId: true } } },
    })
    if (!file || file.revision.documentId !== id) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const annotation = await prisma.documentFileAnnotation.findUnique({
      where: { id: annotationId },
    })
    if (!annotation || annotation.documentFileId !== fileId) {
      return NextResponse.json({ error: 'Annotation not found' }, { status: 404 })
    }

    // Allow admin or uploader to delete
    if (user.role !== 'ADMIN' && annotation.createdById !== user.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await deleteStoredFile(annotation.storagePath)
    await prisma.documentFileAnnotation.delete({ where: { id: annotationId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete annotation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

