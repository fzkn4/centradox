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

    const action = formData.get('action') as string
    const comment = formData.get('comment') as string
    const file = formData.get('file') as File | null

    if (action !== 'complete-step') {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      )
    }

    if (!comment || comment.trim() === '') {
      return NextResponse.json(
        { error: 'Comment is required' },
        { status: 400 }
      )
    }

     const document = await prisma.document.findUnique({
       where: { id },
       include: {
         createdBy: true,
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
         workflowInstances: {
           include: {
             steps: {
               include: {
                 assignedTo: true,
                 department: true
               }
             }
           }
         }
       }
     })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const workflowInstance = document.workflowInstances[0]
    if (!workflowInstance) {
      return NextResponse.json(
        { error: 'No active workflow' },
        { status: 400 }
      )
    }

    const currentStep = workflowInstance.steps.find(
      (step: any) => step.stepOrder === workflowInstance.currentStep
    )

    if (!currentStep) {
      return NextResponse.json(
        { error: 'Invalid workflow state' },
        { status: 400 }
      )
    }

    if (currentStep.role !== user.role && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Not authorized to complete this step' },
        { status: 403 }
      )
    }

    const userWithDepartments = await prisma.user.findUnique({
      where: { id: user.userId },
      include: {
        departments: true
      }
    })

    const isInDepartment = userWithDepartments?.departments.some(
      (dept: any) => dept.id === currentStep.departmentId
    )

    if (!isInDepartment && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'You are not in the assigned department' },
        { status: 403 }
      )
    }

    if (user.role === 'EDITOR' && (!file || file.size === 0)) {
      return NextResponse.json(
        { error: 'File upload is required for editors' },
        { status: 400 }
      )
    }

    let versionId: string | null = null
    let versionNumber: number | null = null

    if (file && file.size > 0) {
      const latestVersion = await prisma.documentVersion.findFirst({
        where: { documentId: id },
        orderBy: { versionNumber: 'desc' }
      })

      versionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1
      const fileData = await saveFile(file)

      const newVersion = await prisma.documentVersion.create({
        data: {
          versionNumber,
          fileName: fileData.fileName,
          fileSize: fileData.fileSize,
          mimeType: fileData.mimeType,
          filePath: fileData.filePath,
          documentId: id,
          createdById: user.userId
        }
      })

      versionId = newVersion.id

      await prisma.document.update({
        where: { id },
        data: {
          currentVersionId: newVersion.id
        }
      })
    }

    await prisma.workflowStep.update({
      where: { id: currentStep.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        comment: comment.trim()
      }
    })

    // Create notifications for department users and admins
    try {
      if (document.departments.length > 0) {
        const departmentUsers = await prisma.user.findMany({
          where: {
            departments: {
              some: {
                  id: { in: document.departments.map((d: any) => d.departmentId) }
              }
            }
          },
          select: { id: true }
        })

        const admins = await prisma.user.findMany({
          where: { role: 'ADMIN' },
          select: { id: true }
        })

        const notifiedUserIds = [...new Set([...departmentUsers.map((u: any) => u.id), ...admins.map((u: any) => u.id)])]

        const departmentNames = document.departments.map((d: any) => d.department.name).join(', ')

        console.log(`Creating step completion notifications for "${document.title}" in ${departmentNames}: found ${departmentUsers.length} department users, ${admins.length} admins, total ${notifiedUserIds.length} notifications`)

        if (notifiedUserIds.length > 0) {
          await prisma.notification.createMany({
            data: notifiedUserIds.map(userId => ({
              userId,
              type: 'step_completed',
              message: `Step completed for "${document.title}" in ${departmentNames || 'your department'}`,
              documentId: document.id
            }))
          })
          console.log(`Successfully created ${notifiedUserIds.length} step completion notifications for "${document.title}"`)
        } else {
          console.warn(`No users found to notify for step completion of "${document.title}" in departments ${document.departments.map((d: any) => d.departmentId).join(', ')}`)
        }
      } else {
        const admins = await prisma.user.findMany({
          where: { role: 'ADMIN' },
          select: { id: true }
        })

        console.log(`Creating step completion notifications for "${document.title}" (no departments): found ${admins.length} admins`)

        if (admins.length > 0) {
          await prisma.notification.createMany({
            data: admins.map((admin: any) => ({
              userId: admin.id,
              type: 'step_completed',
              message: `Step completed for "${document.title}"`,
              documentId: document.id
            }))
          })
          console.log(`Successfully created ${admins.length} step completion notifications for "${document.title}"`)
        } else {
          console.warn(`No admins found to notify for step completion of "${document.title}"`)
        }
      }
    } catch (notificationError) {
      console.error('Failed to create step completion notifications:', notificationError)
      // Don't fail the step completion if notifications fail
    }

    const nextStep = workflowInstance.steps.find(
      (step: any) => step.stepOrder === workflowInstance.currentStep + 1
    )

    if (nextStep) {
      await prisma.workflowInstance.update({
        where: { id: workflowInstance.id },
        data: {
          currentStep: nextStep.stepOrder
        }
      })
    } else {
      await prisma.workflowInstance.update({
        where: { id: workflowInstance.id },
        data: {
          completedAt: new Date(),
          currentStep: 999
        }
      })

      await prisma.document.update({
        where: { id },
        data: {
          currentStatus: 'APPROVED'
        }
      })

      // Create approval notifications for department users and admins
      try {
        if (document.departments.length > 0) {
          const departmentUsers = await prisma.user.findMany({
            where: {
              departments: {
                some: {
                id: { in: document.departments.map((d: any) => d.departmentId) }
                }
              }
            },
            select: { id: true }
          })

          const admins = await prisma.user.findMany({
            where: { role: 'ADMIN' },
            select: { id: true }
          })

          const notifiedUserIds = [...new Set([...departmentUsers.map((u: any) => u.id), ...admins.map((u: any) => u.id)])]

          const departmentNames = document.departments.map((d: any) => d.department.name).join(', ')

          console.log(`Creating approval notifications for "${document.title}" in ${departmentNames}: found ${departmentUsers.length} department users, ${admins.length} admins, total ${notifiedUserIds.length} notifications`)

          if (notifiedUserIds.length > 0) {
            await prisma.notification.createMany({
              data: notifiedUserIds.map(userId => ({
                userId,
                type: 'document_approved',
                message: `Document "${document.title}" has been approved in ${departmentNames || 'your department'}`,
                documentId: document.id
              }))
            })
            console.log(`Successfully created ${notifiedUserIds.length} approval notifications for "${document.title}"`)
          } else {
            console.warn(`No users found to notify for approval of "${document.title}" in departments ${document.departments.map((d: any) => d.departmentId).join(', ')}`)
          }
        } else {
          const admins = await prisma.user.findMany({
            where: { role: 'ADMIN' },
            select: { id: true }
          })

          console.log(`Creating approval notifications for "${document.title}" (no departments): found ${admins.length} admins`)

          if (admins.length > 0) {
            await prisma.notification.createMany({
              data: admins.map((admin: any) => ({
                userId: admin.id,
                type: 'document_approved',
                message: `Document "${document.title}" has been approved`,
                documentId: document.id
              }))
            })
            console.log(`Successfully created ${admins.length} approval notifications for "${document.title}"`)
          } else {
            console.warn(`No admins found to notify for approval of "${document.title}"`)
          }
        }
      } catch (notificationError) {
        console.error('Failed to create approval notifications:', notificationError)
        // Don't fail the document approval if notifications fail
      }
    }

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
        },
        workflowInstances: {
          include: {
            steps: {
              include: {
                assignedTo: {
                  select: {
                    id: true,
                    name: true
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
        }
      }
    })

    return NextResponse.json({
      document: updatedDocument,
      versionId,
      versionNumber
    })
  } catch (error) {
    console.error('Complete step error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
