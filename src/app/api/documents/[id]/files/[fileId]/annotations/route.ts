import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTokenFromRequest, verifyToken } from '@/lib/auth'
import { deleteStoredFile, saveUploadedFile } from '@/lib/uploads'

async function getUserFromRequest(request: NextRequest) {
  const token = getTokenFromRequest(request)
  if (!token) return null
  const payload = verifyToken(token)
  if (!payload) return null
  return payload
}

function assertPng(file: File) {
  const name = file.name.toLowerCase()
  if (!name.endsWith('.png') && file.type !== 'image/png') {
    throw new Error('Only PNG annotations are supported.')
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, fileId } = await params

    const file = await prisma.documentFile.findUnique({
      where: { id: fileId },
      include: { revision: { select: { documentId: true } } },
    })
    if (!file || file.revision.documentId !== id) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const annotations = await prisma.documentFileAnnotation.findMany({
      where: { documentFileId: fileId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        pageNumber: true,
        createdAt: true,
        createdById: true,
      },
    })

    return NextResponse.json({ annotations })
  } catch (error) {
    console.error('List annotations error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, fileId } = await params

    const file = await prisma.documentFile.findUnique({
      where: { id: fileId },
      include: {
        revision: { select: { documentId: true, revisionNumber: true } },
      },
    })
    if (!file || file.revision.documentId !== id) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const annotationFile = formData.get('file') as File | null
    const pageNumber = Number(formData.get('pageNumber') || 1)

    if (!annotationFile) {
      return NextResponse.json({ error: 'Annotation file is required' }, { status: 400 })
    }

    try {
      assertPng(annotationFile)
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? 'Invalid annotation' }, { status: 400 })
    }

    // Enforce one annotation per page: delete existing ones for THIS page and THIS file.
    const existing = await prisma.documentFileAnnotation.findMany({
      where: { 
        documentFileId: fileId,
        pageNumber: pageNumber
      },
      select: { id: true, storagePath: true },
    })

    const saved = await saveUploadedFile({
      file: annotationFile,
      relativeDir: `documents/${id}/rev-${file.revision.revisionNumber}/file-${fileId}/annotations`,
    })

    const created = await prisma.documentFileAnnotation.create({
      data: {
        documentFileId: fileId,
        fileName: saved.fileName,
        fileSize: saved.fileSize,
        mimeType: saved.mimeType,
        storagePath: saved.storagePath,
        pageNumber: pageNumber,
        createdById: user.userId,
      },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        pageNumber: true,
        createdAt: true,
        createdById: true,
      },
    })

    if (existing.length > 0) {
      // Best effort: remove old rows and their files; keep the newly created annotation.
      await prisma.documentFileAnnotation.deleteMany({
        where: { id: { in: existing.map((e: { id: string }) => e.id) } },
      })
      await Promise.all(
        existing.map(async (ann: { storagePath: string }) => {
          try {
            await deleteStoredFile(ann.storagePath)
          } catch (err) {
            console.error('Failed to delete old annotation for page:', err)
          }
        })
      )
    }

    return NextResponse.json({ annotation: created }, { status: 201 })
  } catch (error) {
    console.error('Create annotation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
