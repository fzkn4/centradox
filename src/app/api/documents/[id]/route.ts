import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, getTokenFromRequest } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

async function getUserFromRequest(request: NextRequest) {
  const token = getTokenFromRequest(request)
  if (!token) return null

  const payload = verifyToken(token)
  if (!payload) return null

  return payload
}

async function ensureUploadsDir() {
  const uploadsDir = join(process.cwd(), 'public', 'uploads')
  if (!existsSync(uploadsDir)) {
    await mkdir(uploadsDir, { recursive: true })
  }
  return uploadsDir
}

async function saveFile(file: File): Promise<{ filePath: string; fileName: string; fileSize: number; mimeType: string }> {
  const uploadsDir = await ensureUploadsDir()
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const uniqueFileName = `${Date.now()}-${file.name}`
  const filePath = join(uploadsDir, uniqueFileName)

  await writeFile(filePath, buffer)

  return {
    filePath: `/uploads/${uniqueFileName}`,
    fileName: file.name,
    fileSize: buffer.length,
    mimeType: file.type
  }
}

async function deleteFile(filePath: string) {
  try {
    const fullPath = join(process.cwd(), 'public', filePath)
    const { unlink } = await import('fs/promises')
    await unlink(fullPath)
  } catch (error) {
    console.error('Error deleting file:', error)
  }
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
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            department: true
          }
        },
        versions: {
          include: {
            createdBy: {
              select: {
                id: true,
                email: true,
                name: true
              }
            }
          },
          orderBy: {
            versionNumber: 'desc'
          }
        },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                email: true,
                name: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        },
        workflowInstances: {
          include: {
            steps: {
              include: {
                assignedTo: {
                  select: {
                    id: true,
                    email: true,
                    name: true
                  }
                }
              },
              orderBy: {
                stepOrder: 'asc'
              }
            }
          }
        }
      }
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    return NextResponse.json({ document })
  } catch (error) {
    console.error('Get document error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'File is required' },
        { status: 400 }
      )
    }

    const document = await prisma.document.findUnique({
      where: { id }
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (document.currentStatus === 'FINAL') {
      return NextResponse.json(
        { error: 'Cannot edit final documents' },
        { status: 403 }
      )
    }

    if (document.createdById !== user.userId && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only document author can upload new versions' },
        { status: 403 }
      )
    }

    const latestVersion = await prisma.documentVersion.findFirst({
      where: { documentId: id },
      orderBy: { versionNumber: 'desc' }
    })

    const newVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1

    const fileData = await saveFile(file)

    const newVersion = await prisma.documentVersion.create({
      data: {
        versionNumber: newVersionNumber,
        fileName: fileData.fileName,
        fileSize: fileData.fileSize,
        mimeType: fileData.mimeType,
        filePath: fileData.filePath,
        documentId: id,
        createdById: user.userId
      }
    })

    await prisma.document.update({
      where: { id },
      data: {
        currentVersionId: newVersion.id
      }
    })

    const updatedDocument = await prisma.document.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            department: true
          }
        },
        versions: {
          include: {
            createdBy: {
              select: {
                id: true,
                email: true,
                name: true
              }
            }
          },
          orderBy: {
            versionNumber: 'desc'
          }
        }
      }
    })

    return NextResponse.json({ document: updatedDocument })
  } catch (error) {
    console.error('Update document error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
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
      where: { id }
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (document.currentStatus !== 'DRAFT' && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only draft documents can be deleted' },
        { status: 403 }
      )
    }

    const versions = await prisma.documentVersion.findMany({
      where: { documentId: id }
    })

    for (const version of versions) {
      if (version.filePath) {
        await deleteFile(version.filePath)
      }
    }

    await prisma.document.delete({
      where: { id }
    })

    return NextResponse.json({ message: 'Document deleted successfully' })
  } catch (error) {
    console.error('Delete document error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
