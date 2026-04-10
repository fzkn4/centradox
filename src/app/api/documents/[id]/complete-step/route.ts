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

function canUserActOnStep(params: { stepRole: string; userRole: string }): boolean {
  const { stepRole, userRole } = params
  if (userRole === 'ADMIN') return true

  // Business rule: "DRAFTER steps" are actionable by DRAFTER and EDITOR.
  if (stepRole === 'DRAFTER') return userRole === 'DRAFTER' || userRole === 'EDITOR'
  return stepRole === userRole
}

async function createRevisionBundle(params: {
  documentId: string
  createdById: string
  files: File[]
}): Promise<{ revisionId: string; revisionNumber: number }> {
  const { documentId, createdById, files } = params

  const latest = await prisma.documentRevision.findFirst({
    where: { documentId },
    orderBy: { revisionNumber: 'desc' },
    select: { revisionNumber: true },
  })
  const revisionNumber = latest ? latest.revisionNumber + 1 : 1

  const revision = await prisma.documentRevision.create({
    data: {
      documentId,
      revisionNumber,
      createdById,
    },
    select: { id: true, revisionNumber: true },
  })

  const createdFileStoragePaths: string[] = []
  try {
    for (let idx = 0; idx < files.length; idx++) {
      const file = files[idx]
      const saved = await saveUploadedFile({
        file,
        relativeDir: `documents/${documentId}/rev-${revisionNumber}`,
      })
      createdFileStoragePaths.push(saved.storagePath)
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
    }

    await prisma.document.update({
      where: { id: documentId },
      data: { currentRevisionId: revision.id },
    })

    return { revisionId: revision.id, revisionNumber: revision.revisionNumber }
  } catch (error) {
    await Promise.all(createdFileStoragePaths.map((p) => deleteStoredFile(p)))
    throw error
  }
}

export async function POST(
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

    const action = String(formData.get('action') ?? '')
    const comment = String(formData.get('comment') ?? '')
    const confidentialComment = (formData.get('confidentialComment') as string) || null
    const confidentialCommentVisibleToStr =
      (formData.get('confidentialCommentVisibleTo') as string) || null

    if (action !== 'complete-step' && action !== 'disapprove-step') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const incomingFiles = (formData.getAll('files') as File[]).filter(Boolean)
    const legacyFile = formData.get('file') as File | null
    if (incomingFiles.length === 0 && legacyFile) incomingFiles.push(legacyFile)

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        departments: {
          include: {
            department: { select: { id: true, name: true } },
          },
        },
        workflowInstances: {
          include: {
            steps: {
              include: {
                assignedTo: true,
                department: true,
              },
            },
          },
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const workflowInstance = document.workflowInstances[0]
    if (!workflowInstance) {
      return NextResponse.json({ error: 'No active workflow' }, { status: 400 })
    }

    const currentStep = workflowInstance.steps.find(
      (step: any) => step.stepOrder === workflowInstance.currentStep
    )
    if (!currentStep) {
      return NextResponse.json({ error: 'Invalid workflow state' }, { status: 400 })
    }

    if (!canUserActOnStep({ stepRole: currentStep.role, userRole: user.role })) {
      return NextResponse.json({ error: 'Not authorized to complete this step' }, { status: 403 })
    }

    if (user.role !== 'ADMIN') {
      const userWithDepartments = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { departments: { select: { id: true } } },
      })

      const isInDepartment =
        !currentStep.departmentId ||
        Boolean(userWithDepartments?.departments.some((d: { id: string }) => d.id === currentStep.departmentId))

      if (!isInDepartment) {
        return NextResponse.json({ error: 'You are not in the assigned department' }, { status: 403 })
      }
    }

    const isDrafterStep = currentStep.role === 'DRAFTER'
    const isApproverStep = currentStep.role === 'APPROVER'
    const isEditorCompletingDrafterStep = isDrafterStep && user.role === 'EDITOR'

    const requiresUpload = action === 'complete-step' && isDrafterStep
    const requiresComment =
      action === 'disapprove-step' ||
      isApproverStep ||
      isEditorCompletingDrafterStep ||
      (isDrafterStep && document.currentStatus === 'CHANGES_REQUESTED')

    if (requiresComment && comment.trim() === '') {
      return NextResponse.json({ error: 'Comment is required' }, { status: 400 })
    }

    if (requiresUpload && incomingFiles.length === 0) {
      return NextResponse.json({ error: 'At least one document file is required' }, { status: 400 })
    }

    // Approver uploads are intentionally not creating new revisions.
    if (action === 'complete-step' && isApproverStep && incomingFiles.length > 0) {
      return NextResponse.json(
        { error: 'File upload is not supported for approver steps. Use annotations or add a comment.' },
        { status: 400 }
      )
    }

    if (incomingFiles.length > 0) {
      try {
        incomingFiles.forEach((f) => assertAllowedDocumentFile(f))
      } catch (e: any) {
        return NextResponse.json({ error: e?.message ?? 'Invalid file type' }, { status: 400 })
      }
    }

    if (action === 'disapprove-step') {
      if (!isApproverStep && user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Only approvers can disapprove' }, { status: 403 })
      }

      const finalComment = `[DISAPPROVED] ${comment.trim()}`

      await prisma.comment.create({
        data: {
          text: finalComment,
          documentId: id,
          authorId: user.userId,
        },
      })

      // Find the document creator's primary department (best-effort).
      const creator = await prisma.user.findUnique({
        where: { id: document.createdById },
        select: { departments: { select: { id: true } } },
      })
      const drafterDepartmentId = creator?.departments[0]?.id || null

      // Shift subsequent steps down by 2 to make room for: DRAFTER fix step + re-review step
      await prisma.workflowStep.updateMany({
        where: {
          workflowInstanceId: workflowInstance.id,
          stepOrder: { gt: currentStep.stepOrder },
        },
        data: {
          stepOrder: { increment: 2 },
        },
      })

      await prisma.workflowStep.update({
        where: { id: currentStep.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          completedById: user.userId,
          comment: finalComment,
          confidentialComment,
          confidentialCommentVisibleTo: confidentialCommentVisibleToStr,
        },
      })

      // Link any annotations made by this user that aren't yet linked to a step
      await prisma.documentFileAnnotation.updateMany({
        where: {
          documentFile: {
            revision: { documentId: id }
          },
          createdById: user.userId,
          workflowStepId: null,
        },
        data: {
          workflowStepId: currentStep.id,
        },
      })

      await prisma.workflowStep.create({
        data: {
          workflowInstanceId: workflowInstance.id,
          stepOrder: currentStep.stepOrder + 1,
          departmentId: drafterDepartmentId,
          role: 'DRAFTER',
          status: 'PENDING',
        },
      })

      await prisma.workflowStep.create({
        data: {
          workflowInstanceId: workflowInstance.id,
          stepOrder: currentStep.stepOrder + 2,
          departmentId: currentStep.departmentId,
          assignedToId: currentStep.assignedToId,
          role: currentStep.role,
          status: 'PENDING',
        },
      })

      await prisma.workflowInstance.update({
        where: { id: workflowInstance.id },
        data: { currentStep: currentStep.stepOrder + 1 },
      })

      await prisma.document.update({
        where: { id },
        data: { currentStatus: 'CHANGES_REQUESTED' },
      })

      // Notify department users + admins.
      try {
        const admins = await prisma.user.findMany({
          where: { role: 'ADMIN' },
          select: { id: true },
        })
        const departmentUsers =
          document.departments.length > 0
            ? await prisma.user.findMany({
                where: {
                  departments: {
                    some: { id: { in: document.departments.map((d: any) => d.departmentId) } },
                  },
                },
                select: { id: true },
              })
            : []

        const notifiedUserIds = [
          ...new Set([
            ...departmentUsers.map((u: { id: string }) => u.id),
            ...admins.map((u: { id: string }) => u.id),
          ]),
        ]

        if (notifiedUserIds.length > 0) {
          await prisma.notification.createMany({
            data: notifiedUserIds.map((userId) => ({
              userId,
              type: 'changes_requested',
              message: `Changes requested for "${document.title}"`,
              documentId: document.id,
            })),
          })
        }
      } catch (notificationError) {
        console.error('Failed to create disapproval notifications:', notificationError)
      }
    } else {
      // DRAFTER/EDITOR completion creates a new revision bundle.
      if (isDrafterStep && incomingFiles.length > 0) {
        await createRevisionBundle({
          documentId: id,
          createdById: user.userId,
          files: incomingFiles,
        })
      }

      await prisma.workflowStep.update({
        where: { id: currentStep.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          comment: comment.trim(),
          confidentialComment,
          confidentialCommentVisibleTo: confidentialCommentVisibleToStr,
          completedById: user.userId,
        },
      })

      // Link any annotations made by this user that aren't yet linked to a step
      await prisma.documentFileAnnotation.updateMany({
        where: {
          documentFile: {
            revision: { documentId: id }
          },
          createdById: user.userId,
          workflowStepId: null,
        },
        data: {
          workflowStepId: currentStep.id,
        },
      })

      // Step completion notifications (best-effort).
      try {
        const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
        const departmentUsers =
          document.departments.length > 0
            ? await prisma.user.findMany({
                where: {
                  departments: {
                    some: { id: { in: document.departments.map((d: any) => d.departmentId) } },
                  },
                },
                select: { id: true },
              })
            : []

        const notifiedUserIds = [
          ...new Set([
            ...departmentUsers.map((u: { id: string }) => u.id),
            ...admins.map((u: { id: string }) => u.id),
          ]),
        ]
        const departmentNames = document.departments.map((d: any) => d.department.name).join(', ')

        if (notifiedUserIds.length > 0) {
          await prisma.notification.createMany({
            data: notifiedUserIds.map((userId) => ({
              userId,
              type: 'step_completed',
              message: `Step completed for "${document.title}"${departmentNames ? ` in ${departmentNames}` : ''}`,
              documentId: document.id,
            })),
          })
        }
      } catch (notificationError) {
        console.error('Failed to create step completion notifications:', notificationError)
      }

      // Find next step and advance workflow
      const nextStep = workflowInstance.steps
        .filter((s: any) => s.stepOrder > currentStep.stepOrder)
        .sort((a: any, b: any) => a.stepOrder - b.stepOrder)[0]

      if (nextStep) {
        await prisma.workflowInstance.update({
          where: { id: workflowInstance.id },
          data: { currentStep: nextStep.stepOrder },
        })

        if (document.currentStatus === 'CHANGES_REQUESTED' || document.currentStatus === 'DRAFT') {
          await prisma.document.update({
            where: { id },
            data: { currentStatus: 'FOR_REVIEW' },
          })
        }
      } else {
        await prisma.workflowInstance.update({
          where: { id: workflowInstance.id },
          data: { completedAt: new Date(), currentStep: 999 },
        })

        await prisma.document.update({
          where: { id },
          data: { currentStatus: 'APPROVED' },
        })

        // Approval notifications (best-effort).
        try {
          const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
          const departmentUsers =
            document.departments.length > 0
              ? await prisma.user.findMany({
                  where: {
                    departments: {
                      some: { id: { in: document.departments.map((d: any) => d.departmentId) } },
                    },
                  },
                  select: { id: true },
                })
              : []

          const notifiedUserIds = [
            ...new Set([
              ...departmentUsers.map((u: { id: string }) => u.id),
              ...admins.map((u: { id: string }) => u.id),
            ]),
          ]
          const departmentNames = document.departments.map((d: any) => d.department.name).join(', ')

          if (notifiedUserIds.length > 0) {
            await prisma.notification.createMany({
              data: notifiedUserIds.map((userId) => ({
                userId,
                type: 'document_approved',
                message: `Document "${document.title}" has been approved${departmentNames ? ` in ${departmentNames}` : ''}`,
                documentId: document.id,
              })),
            })
          }
        } catch (notificationError) {
          console.error('Failed to create approval notifications:', notificationError)
        }
      }
    }

    const updatedDocument = await prisma.document.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, username: true, name: true, role: true } },
        departments: {
          include: { department: { select: { id: true, name: true } } },
        },
        versions: {
          include: { createdBy: { select: { id: true, name: true } } },
          orderBy: { versionNumber: 'desc' },
        },
        revisions: {
          include: {
            createdBy: { select: { id: true, username: true, name: true, role: true } },
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
        referenceFiles: true,
        workflowInstances: {
          include: {
            steps: {
              include: {
                assignedTo: { select: { id: true, name: true } },
                completedBy: { select: { id: true, name: true, role: true } },
              },
              orderBy: { stepOrder: 'asc' },
            },
          },
          orderBy: { startedAt: 'desc' },
        },
      },
    })

    // EMIT SOCKET EVENT FOR REAL-TIME UPDATES via internal server endpoint (best-effort)
    try {
      const eventName = action === 'disapprove-step' ? 'document_disapproved' : 'step_completed'
      const payload = {
        documentId: id,
        title: updatedDocument?.title ?? document.title,
        ...(action !== 'disapprove-step' && { isFinalStep: updatedDocument?.currentStatus === 'APPROVED' }),
      }

      await fetch(`http://localhost:${process.env.PORT || 3000}/api/internal/socket-emit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: eventName, payload }),
      })
    } catch (err) {
      console.error('Failed to internal socket emit:', err)
    }

    return NextResponse.json({ document: updatedDocument })
  } catch (error) {
    console.error('Complete step error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
