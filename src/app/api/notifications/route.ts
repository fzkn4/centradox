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

interface Notification {
  id: string
  type: string
  message: string
  documentId?: string
  read: boolean
  createdAt: string
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userWithDepartments = await prisma.user.findUnique({
      where: { id: user.userId },
      include: {
        departments: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })

    if (!userWithDepartments) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const userDepartmentIds = userWithDepartments.departments.map((d: any) => d.id)

    const documents = await prisma.document.findMany({
      where: {
        workflowInstances: {
          some: {
            steps: {
              some: {
                departmentId: {
                  in: userDepartmentIds
                }
              }
            }
          }
        }
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true
          }
        },
        workflowInstances: {
          include: {
            steps: {
              include: {
                department: {
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
      },
      orderBy: {
        updatedAt: 'desc'
      }
    })

    const notifications: Notification[] = []

    documents.forEach((doc: any) => {
      const workflowInstance = doc.workflowInstances[0]
      if (!workflowInstance) return

      const userDepartmentSteps = workflowInstance.steps.filter((step: any) =>
        step.departmentId && userDepartmentIds.includes(step.departmentId)
      )

      userDepartmentSteps.forEach((step: any) => {
        const hasRequiredRole = step.role === user.role || user.role === 'ADMIN'
        const isCurrentStep = step.stepOrder === workflowInstance.currentStep
        const isPending = step.status === 'PENDING' || step.status === 'IN_PROGRESS'

        if (hasRequiredRole && isCurrentStep && isPending) {
          notifications.push({
            id: `doc-${doc.id}-step-${step.id}`,
            type: 'document_approval',
            message: `Action required for "${doc.title}" in ${step.department?.name || 'your department'}`,
            documentId: doc.id,
            read: false, // Assume unread for simplicity
            createdAt: doc.updatedAt
          })
        }
      })
    })

    return NextResponse.json({ notifications })
  } catch (error) {
    console.error('Get notifications error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}