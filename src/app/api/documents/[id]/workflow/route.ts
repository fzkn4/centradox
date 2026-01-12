import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, getTokenFromRequest } from '@/lib/auth'


async function getUserFromRequest(request: NextRequest) {
  const token = getTokenFromRequest(request)
  if (!token) return null
  
  const payload = verifyToken(token)
  if (!payload) return null
  
  return payload
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
    const body = await request.json()
    const { action, comment } = body

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        createdBy: true,
        workflowInstances: {
          include: {
            steps: {
              include: {
                assignedTo: true
              }
            }
          }
        }
      }
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    let workflowInstance = document.workflowInstances[0]

    if (!workflowInstance && action === 'submit') {
      workflowInstance = await prisma.workflowInstance.create({
        data: {
          documentId: id,
          currentStep: 1,
          steps: {
            create: [
              {
                stepOrder: 1,
                role: 'APPROVER',
                assignedToId: user.userId
              }
            ]
          }
        },
        include: {
          steps: {
            include: {
              assignedTo: true
            }
          }
        }
      })

      await prisma.document.update({
        where: { id },
        data: { currentStatus: 'FOR_REVIEW' }
      })

      return NextResponse.json({
        document: {
          ...document,
          currentStatus: 'FOR_REVIEW',
          workflowInstances: [workflowInstance]
        }
      })
    }

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

    if (action === 'approve') {
      if (currentStep.assignedToId !== user.userId && user.role !== 'ADMIN') {
        return NextResponse.json(
          { error: 'Not authorized to approve this step' },
          { status: 403 }
        )
      }

      await prisma.workflowStep.update({
        where: { id: currentStep.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          comment
        }
      })

      const nextStep = workflowInstance.steps.find(
        (step: any) => step.stepOrder === workflowInstance.currentStep + 1
      )

      if (nextStep) {
        await prisma.workflowInstance.update({
          where: { id: workflowInstance.id },
          data: { currentStep: nextStep.stepOrder }
        })
      } else {
        await prisma.workflowInstance.update({
          where: { id: workflowInstance.id },
          data: { completedAt: new Date(), currentStep: 999 }
        })

        await prisma.document.update({
          where: { id },
          data: { currentStatus: 'APPROVED' }
        })
      }
    } else if (action === 'request-changes') {
      if (currentStep.assignedToId !== user.userId && user.role !== 'ADMIN') {
        return NextResponse.json(
          { error: 'Not authorized to request changes' },
          { status: 403 }
        )
      }

      await prisma.workflowStep.update({
        where: { id: currentStep.id },
        data: {
          status: 'PENDING',
          comment
        }
      })

        await prisma.document.update({
          where: { id },
          data: { currentStatus: 'CHANGES_REQUESTED' }
        })
    }

    const updatedDocument = await prisma.document.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            username: true,
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
                username: true,
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
                    username: true,
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

    return NextResponse.json({ document: updatedDocument })
  } catch (error) {
    console.error('Workflow action error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
