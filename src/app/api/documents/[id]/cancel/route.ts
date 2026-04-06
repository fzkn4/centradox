import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, getTokenFromRequest } from '@/lib/auth'
import { canUserCancelDocument } from '@/lib/permissions'
import { existsSync } from 'fs'
import { unlink } from 'fs/promises'
import { join } from 'path'

async function getUserFromRequest(request: NextRequest) {
  const token = getTokenFromRequest(request)
  if (!token) return null
  
  const payload = verifyToken(token)
  if (!payload) return null
  
  return payload
}

interface WorkflowStepInfo {
  role: string
  status: string
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

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        workflowInstances: {
          include: {
            steps: true
          }
        }
      }
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const workflowInstance = document.workflowInstances[0]
    if (!workflowInstance) {
      return NextResponse.json({ error: 'No workflow found' }, { status: 400 })
    }

    const workflowSteps: WorkflowStepInfo[] = workflowInstance.steps.map((step: any) => ({
      role: step.role,
      status: step.status
    }))

    if (!canUserCancelDocument(
      document.currentStatus,
      document.createdById,
      user.userId,
      user.role,
      workflowSteps
    )) {
      return NextResponse.json(
        { error: 'You cannot cancel this document. It has already been reviewed by an Approver.' },
        { status: 403 }
      )
    }

    const versions = await prisma.documentVersion.findMany({
      where: { documentId: id }
    })

    for (const version of versions) {
      if (version.filePath) {
        const fullPath = join(process.cwd(), 'public', version.filePath)
        if (existsSync(fullPath)) {
          await unlink(fullPath)
        }
      }
    }

    const refFiles = await prisma.documentReferenceFile.findMany({
      where: { documentId: id }
    })

    for (const refFile of refFiles) {
      const fullPath = join(process.cwd(), 'public', refFile.filePath)
      if (existsSync(fullPath)) {
        await unlink(fullPath)
      }
    }

    await prisma.document.delete({
      where: { id }
    })

    return NextResponse.json({ message: 'Document cancelled and deleted successfully' })
  } catch (error) {
    console.error('Cancel document error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
