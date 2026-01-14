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
      where.createdBy = {
        department: department
      }
    }

    if (myDocs) {
      where.createdById = user.userId
    }

    const documents = await prisma.document.findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            username: true,
            name: true,
            role: true
          }
        },
        department: {
          select: {
            id: true,
            name: true
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
    const departmentId = formData.get('departmentId') as string | null
    const priority = formData.get('priority') as string
    const timelineSteps = formData.get('timelineSteps') as string | null

    if (!title || !type || !file) {
      return NextResponse.json(
        { error: 'Title, type, and file are required' },
        { status: 400 }
      )
    }

    const fileData = await saveFile(file)

    const document = await prisma.document.create({
      data: {
        title,
        type,
        currentStatus: 'DRAFT',
        createdById: user.userId,
        departmentId: departmentId || null,
        priority: (priority as any) || 'MEDIUM',
        versions: {
          create: {
            versionNumber: 1,
            fileName: fileData.fileName,
            fileSize: fileData.fileSize,
            mimeType: fileData.mimeType,
            filePath: fileData.filePath,
            createdById: user.userId
          }
        }
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
        department: {
          select: {
            id: true,
            name: true
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
              role: step.role as any,
              assignedToId: user.userId
            }))
          }
        }
      })
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
