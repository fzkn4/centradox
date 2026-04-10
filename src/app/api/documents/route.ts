import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, getTokenFromRequest } from '@/lib/auth'
import { assertAllowedDocumentFile, saveUploadedFile } from '@/lib/uploads'

async function getUserFromRequest(request: NextRequest) {
  const token = getTokenFromRequest(request)
  if (!token) return null

  const payload = verifyToken(token)
  if (!payload) return null

  return payload
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const department = searchParams.get('department')
    const myDocs = searchParams.get('myDocs') === 'true'
    const priority = searchParams.get('priority')
    const timeframe = searchParams.get('timeframe')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const statusGroup = searchParams.get('statusGroup')
    const overdue = searchParams.get('overdue') === 'true'
    const dueSoon = searchParams.get('dueSoon') === 'true'
    const complianceType = searchParams.get('complianceType')

    const where: any = {}

    if (status) {
      where.currentStatus = status
    } else if (statusGroup) {
      if (statusGroup === 'in_progress') {
        where.currentStatus = { in: ['FOR_REVIEW', 'CHANGES_REQUESTED'] }
      } else if (statusGroup === 'approved') {
        where.currentStatus = { in: ['APPROVED', 'FINAL'] }
      } else if (statusGroup === 'draft') {
        where.currentStatus = 'DRAFT'
      }
    }

    if (type) {
      where.type = type
    }

    if (priority) {
      where.priority = priority
    }

    if (complianceType) {
      where.complianceType = complianceType
    }

    if (overdue) {
      where.deadline = { lt: new Date() }
      where.currentStatus = { notIn: ['APPROVED', 'FINAL'] }
    } else if (dueSoon) {
      const now = new Date()
      const threeDaysFromNow = new Date()
      threeDaysFromNow.setDate(now.getDate() + 3)
      where.deadline = {
        gte: now,
        lte: threeDaysFromNow
      }
      where.currentStatus = { notIn: ['APPROVED', 'FINAL'] }
    }

    if (timeframe || (startDate && endDate)) {
      let start: Date | undefined
      let end: Date | undefined
      const now = new Date()

      if (timeframe === 'daily') {
        start = new Date(now.setHours(0, 0, 0, 0))
        end = new Date(now.setHours(23, 59, 59, 999))
      } else if (timeframe === 'weekly') {
        const day = now.getDay()
        const diff = now.getDate() - day + (day === 0 ? -6 : 1)
        start = new Date(now.setDate(diff))
        start.setHours(0, 0, 0, 0)
        end = new Date(start)
        end.setDate(start.getDate() + 6)
        end.setHours(23, 59, 59, 999)
      } else if (timeframe === 'monthly') {
        start = new Date(now.getFullYear(), now.getMonth(), 1)
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      } else if (timeframe === 'yearly') {
        start = new Date(now.getFullYear(), 0, 1)
        end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
      } else if (startDate && endDate) {
        start = new Date(startDate)
        end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
      }

      if (start && end) {
        where.createdAt = {
          gte: start,
          lte: end
        }
      }
    }

    if (department) {
      where.departments = {
        some: {
          departmentId: department
        }
      }
    }

    if (myDocs) {
      where.createdById = user.userId
    }

    // Get user's departments for visibility filtering
    const userWithDepartments = await prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        departments: {
          select: { id: true }
        }
      }
    })

    const userDepartmentIds = userWithDepartments?.departments.map((d: any) => d.id) || []

    // Filter documents by visibility: show documents where user is in selected departments or all departments if none selected
    const visibilityWhere = {
      OR: [
        { departments: { none: {} } }, // No departments selected means visible to all
        { departments: { some: { departmentId: { in: userDepartmentIds } } } }
      ]
    }

    const documents = await prisma.document.findMany({
      where: {
        ...where,
        ...visibilityWhere
      },
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
        _count: {
          select: {
            versions: true,
            comments: true
          }
        },
        workflowInstances: {
          include: {
            steps: true
          },
          orderBy: {
            startedAt: 'desc'
          },
          take: 1
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    })

    return NextResponse.json({ documents })
  } catch (error) {
    console.error('Get documents error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const title = formData.get('title') as string
    const type = formData.get('type') as string
    const files = formData.getAll('files') as File[]
    const referenceFiles = formData.getAll('referenceFiles') as File[]
    const departmentIds = formData.get('departmentIds') as string | null
    const priority = formData.get('priority') as string
    const deadline = formData.get('deadline') as string | null
    const timelineSteps = formData.get('timelineSteps') as string | null
    const complianceType = formData.get('complianceType') as string | null

    if (!title || !type) {
      return NextResponse.json(
        { error: 'Title and type are required' },
        { status: 400 }
      )
    }

    // If user is DRAFTER, file upload is required
    // If user is not DRAFTER, file upload is optional but workflow must start with DRAFTER
    const isDrafter = user.role === 'DRAFTER'

    if (isDrafter && files.length === 0) {
      return NextResponse.json(
        { error: 'Initial document upload is required for DRAFTER role' },
        { status: 400 }
      )
    }

    try {
      files.forEach((f) => assertAllowedDocumentFile(f))
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? 'Invalid file type' }, { status: 400 })
    }

    // Parse timeline steps and validate
    let parsedTimelineSteps: Array<{ departmentId: string | null, role: string }> = []
    if (timelineSteps) {
      try {
        parsedTimelineSteps = JSON.parse(timelineSteps)
      } catch (error) {
        return NextResponse.json(
          { error: 'Invalid timeline steps format' },
          { status: 400 }
        )
      }
    }

    // Workflow timeline is required for ALL users
    if (parsedTimelineSteps.length === 0) {
      return NextResponse.json(
        { error: 'Workflow timeline is required for all document creation' },
        { status: 400 }
      )
    }

    const parsedDepartmentIds = departmentIds ? JSON.parse(departmentIds) : []

    let documentData: any = {
      title,
      type,
      currentStatus: 'FOR_REVIEW',
      createdById: user.userId,
      priority: (priority as any) || 'RESTRICTED',
      complianceType: (complianceType as any) || null,
      deadline: deadline ? new Date(deadline) : null,
      departments: parsedDepartmentIds.length > 0 ? {
        create: parsedDepartmentIds.map((deptId: string) => ({ departmentId: deptId }))
      } : undefined
    }

    if (referenceFiles.length > 0) {
      // Reference files keep the legacy behavior for now (stored path under uploads root would be better,
      // but this feature request is about "document files", not reference files).
      const savedRefFiles = await Promise.all(
        referenceFiles.map(async (refFile) => {
          // Store reference files under uploads as well to avoid public access
          const saved = await saveUploadedFile({
            file: refFile,
            relativeDir: `documents/_references/${Date.now()}`,
          })
          return {
            filePath: saved.storagePath,
            fileName: saved.fileName,
            fileSize: saved.fileSize,
            mimeType: saved.mimeType,
          }
        })
      )
      documentData.referenceFiles = {
        create: savedRefFiles.map(refData => ({
          fileName: refData.fileName,
          fileSize: refData.fileSize,
          mimeType: refData.mimeType,
          filePath: refData.filePath
        }))
      }
    }

    const document = await prisma.document.create({
      data: documentData,
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
                username: true,
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

    // Create initial revision bundle if files were provided
    if (files.length > 0) {
      const revision = await prisma.documentRevision.create({
        data: {
          documentId: document.id,
          revisionNumber: 1,
          createdById: user.userId,
        },
      })

      const savedFiles = await Promise.all(
        files.map(async (f, idx) => {
          const saved = await saveUploadedFile({
            file: f,
            relativeDir: `documents/${document.id}/rev-1`,
          })
          return prisma.documentFile.create({
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
        where: { id: document.id },
        data: { currentRevisionId: revision.id },
      })
    }

    if (parsedTimelineSteps.length > 0) {
      const workflowInstance = await prisma.workflowInstance.create({
        data: {
          documentId: document.id,
          currentStep: 1,
          steps: {
            create: parsedTimelineSteps.map((step, index) => ({
              stepOrder: index + 1,
              departmentId: step.departmentId,
              role: step.role as any
            }))
          }
        }
      })
    }

    // Create notifications for department users and admins
    console.log(`🔄 Starting notification creation for document "${title}" with departmentIds:`, parsedDepartmentIds)
    try {
      if (parsedDepartmentIds.length === 0) {
        // Notify all users with departments + admins (visible to all departments)
        const allUsersWithDepartments = await prisma.user.findMany({
          where: {
            departments: {
              some: {}
            }
          },
          select: { id: true }
        })

        const admins = await prisma.user.findMany({
          where: { role: 'ADMIN' },
          select: { id: true }
        })

        const notifiedUserIds = [...new Set([...allUsersWithDepartments.map((u: any) => u.id), ...admins.map((u: any) => u.id)])]

        console.log(`Creating notifications for document "${title}" (visible to all): found ${allUsersWithDepartments.length} users with departments, ${admins.length} admins, total ${notifiedUserIds.length} notifications`)

        if (notifiedUserIds.length > 0) {
          await prisma.notification.createMany({
            data: notifiedUserIds.map(userId => ({
              userId,
              type: 'document_created',
              message: `New document "${title}" created (visible to all departments)`,
              documentId: document.id
            }))
          })
          console.log(`Successfully created ${notifiedUserIds.length} notifications for document "${title}"`)
        } else {
          console.warn(`No users found to notify for document "${title}" - no departments specified but no users have departments`)
        }
      } else {
        // Notify specific department users + admins
        const departmentUsers = await prisma.user.findMany({
          where: {
            departments: {
              some: { id: { in: parsedDepartmentIds } }
            }
          },
          select: { id: true }
        })

        const admins = await prisma.user.findMany({
          where: { role: 'ADMIN' },
          select: { id: true }
        })

        const notifiedUserIds = [...new Set([...departmentUsers.map((u: any) => u.id), ...admins.map((u: any) => u.id)])]

        console.log(`Creating notifications for document "${title}" in departments ${parsedDepartmentIds.join(', ')}: found ${departmentUsers.length} department users, ${admins.length} admins, total ${notifiedUserIds.length} notifications`)

        if (notifiedUserIds.length > 0) {
          await prisma.notification.createMany({
            data: notifiedUserIds.map(userId => ({
              userId,
              type: 'document_created',
              message: `New document "${title}" created in ${document.departments.length > 0 ? document.departments.map((d: any) => d.department.name).join(', ') : 'your department'}`,
              documentId: document.id
            }))
          })
          console.log(`Successfully created ${notifiedUserIds.length} notifications for document "${title}"`)
        } else {
          console.warn(`No users found to notify for document "${title}" in departments ${parsedDepartmentIds.join(', ')}`)
        }
      }

      console.log(`✅ Notification creation completed for document "${title}"`)

      // EMIT SOCKET EVENT via Internal Server Endpoint
      try {
        await fetch(`http://localhost:${process.env.PORT || 3000}/api/internal/socket-emit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'new_document',
            payload: {
              documentId: document.id,
              title: document.title,
              departmentIds: parsedDepartmentIds
            }
          })
        })
      } catch (err) {
        console.error('Failed to internal socket emit:', err)
      }

    } catch (notificationError) {
      console.error('❌ Failed to create notifications for document creation:', notificationError)
      // Don't fail the document creation if notifications fail
    }

    return NextResponse.json({ document }, { status: 201 })
  } catch (error) {
    console.error('Create document error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
