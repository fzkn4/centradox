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

    const where: any = {}

    if (status) {
      where.currentStatus = status
    }

    if (type) {
      where.type = type
    }

    if (department) {
      where.departments = {
        some: {
          department: {
            id: department
          }
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
    const file = formData.get('file') as File
    const departmentIds = formData.get('departmentIds') as string | null
    const priority = formData.get('priority') as string
    const deadline = formData.get('deadline') as string | null
    const timelineSteps = formData.get('timelineSteps') as string | null

    if (!title || !type || !file) {
      return NextResponse.json(
        { error: 'Title, type, and file are required' },
        { status: 400 }
      )
    }

    const fileData = await saveFile(file)

    const parsedDepartmentIds = departmentIds ? JSON.parse(departmentIds) : []

    const document = await prisma.document.create({
      data: {
        title,
        type,
        currentStatus: 'DRAFT',
        createdById: user.userId,
        priority: (priority as any) || 'MEDIUM',
        deadline: deadline ? new Date(deadline) : null,
        versions: {
          create: {
            versionNumber: 1,
            fileName: fileData.fileName,
            fileSize: fileData.fileSize,
            mimeType: fileData.mimeType,
            filePath: fileData.filePath,
            createdById: user.userId
          }
        },
        departments: parsedDepartmentIds.length > 0 ? {
          create: parsedDepartmentIds.map((deptId: string) => ({ departmentId: deptId }))
        } : undefined
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

    await prisma.document.update({
      where: { id: document.id },
      data: {
        currentVersionId: document.versions[0].id
      }
    })

    if (timelineSteps) {
      const steps = JSON.parse(timelineSteps) as Array<{ departmentId: string | null, role: string }>

      const workflowInstance = await prisma.workflowInstance.create({
        data: {
          documentId: document.id,
          currentStep: 1,
          steps: {
            create: steps.map((step, index) => ({
              stepOrder: index + 1,
              departmentId: step.departmentId,
              role: step.role as any
            }))
          }
        }
      })
    }

    // Create notifications for department users and admins
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
    } catch (notificationError) {
      console.error('Failed to create notifications for document creation:', notificationError)
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
