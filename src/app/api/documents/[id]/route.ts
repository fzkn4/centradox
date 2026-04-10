import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, getTokenFromRequest } from '@/lib/auth'
import { assertAllowedDocumentFile, deleteStoredFile, saveUploadedFile } from '@/lib/uploads'

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
      include: {
        createdBy: {
          select: {
            id: true,
            username: true,
            name: true,
            role: true
          }
        },
        departments: {
          include: {
            department: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        versions: {
          include: {
            createdBy: {
              select: {
                id: true,
                name: true
              }
            }
          },
          orderBy: {
            versionNumber: 'desc'
          }
        },
        revisions: {
          include: {
            createdBy: {
              select: { id: true, username: true, name: true, role: true },
            },
            files: {
              include: {
                annotations: {
                  select: {
                    id: true,
                    fileName: true,
                    fileSize: true,
                    mimeType: true,
                    pageNumber: true,
                    workflowStepId: true,
                    createdAt: true,
                    createdById: true,
                  },
                  orderBy: { createdAt: 'desc' },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { revisionNumber: 'desc' },
        },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                username: true,
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
                department: {
                  select: {
                    id: true,
                    name: true,
                    users: {
                      select: {
                        id: true,
                        name: true,
                        role: true
                      }
                    }
                  }
                },
                assignedTo: {
                  select: {
                    id: true,
                    name: true,
                    phoneNumber: true
                  }
                },
                completedBy: {
                  select: {
                    id: true,
                    name: true,
                    role: true,
                    phoneNumber: true
                  }
                }
              },
              orderBy: {
                stepOrder: 'asc'
              }
            }
          },
          orderBy: {
            startedAt: 'desc'
          }
        },
        referenceFiles: true
      }
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (user.role !== 'ADMIN') {
      document.workflowInstances.forEach((instance: any) => {
        instance.steps.forEach((step: any) => {
          if (step.confidentialComment) {
            let canView = false;
            if (step.completedById === user.userId) {
              canView = true;
            } else if (step.confidentialCommentVisibleTo) {
              try {
                const visibleTo = JSON.parse(step.confidentialCommentVisibleTo);
                if (Array.isArray(visibleTo) && visibleTo.includes(user.userId)) {
                  canView = true;
                }
              } catch (e) {
                // ignore parsing error
              }
            }
            if (!canView) {
              step.confidentialComment = null;
              step.confidentialCommentVisibleTo = null;
            }
          }
        });
      });
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
    const files = (formData.getAll('files') as File[]).filter(Boolean)
    const legacyFile = formData.get('file') as File | null
    if (files.length === 0 && legacyFile) files.push(legacyFile)

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'At least one file is required' },
        { status: 400 }
      )
    }

    try {
      files.forEach((f) => assertAllowedDocumentFile(f))
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? 'Invalid file type' }, { status: 400 })
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

    if (
      user.role !== 'ADMIN' &&
      document.currentStatus !== 'DRAFT' &&
      document.currentStatus !== 'CHANGES_REQUESTED'
    ) {
      return NextResponse.json(
        { error: 'New revisions can only be uploaded in DRAFT or CHANGES_REQUESTED status' },
        { status: 403 }
      )
    }

    if (document.createdById !== user.userId && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only document author can upload new versions' },
        { status: 403 }
      )
    }

    const latestRevision = await prisma.documentRevision.findFirst({
      where: { documentId: id },
      orderBy: { revisionNumber: 'desc' },
      select: { revisionNumber: true },
    })
    const nextRevisionNumber = latestRevision ? latestRevision.revisionNumber + 1 : 1

    const revision = await prisma.documentRevision.create({
      data: {
        documentId: id,
        revisionNumber: nextRevisionNumber,
        createdById: user.userId,
      },
    })

    await Promise.all(
      files.map(async (f, idx) => {
        const saved = await saveUploadedFile({
          file: f,
          relativeDir: `documents/${id}/rev-${nextRevisionNumber}`,
        })
        await prisma.documentFile.create({
          data: {
            revisionId: revision.id,
            fileName: saved.fileName,
            fileSize: saved.fileSize,
            mimeType: saved.mimeType,
            storagePath: saved.storagePath,
            isPrimary: idx === 0,
          },
        })
      })
    )

    await prisma.document.update({
      where: { id },
      data: { currentRevisionId: revision.id },
    })

    const updatedDocument = await prisma.document.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            username: true,
            name: true,
            role: true
          }
        },
        departments: {
          include: {
            department: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        versions: {
          include: {
            createdBy: {
              select: {
                id: true,
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

    // Delete revision files + annotations from disk
    const revisions = await prisma.documentRevision.findMany({
      where: { documentId: id },
      include: {
        files: {
          include: { annotations: true },
        },
      },
    })

    for (const rev of revisions) {
      for (const file of rev.files) {
        await deleteStoredFile(file.storagePath)
        for (const ann of file.annotations) {
          await deleteStoredFile(ann.storagePath)
        }
      }
    }

    // Delete legacy version files (if any still exist)
    const versions = await prisma.documentVersion.findMany({ where: { documentId: id } })
    for (const v of versions) {
      await deleteStoredFile(v.filePath)
    }

    // Delete reference files from disk
    const refFiles = await prisma.documentReferenceFile.findMany({ where: { documentId: id } })
    for (const refFile of refFiles) {
      await deleteStoredFile(refFile.filePath)
    }

    // Cascade delete removes versions, workflows, comments, notifications from DB
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
