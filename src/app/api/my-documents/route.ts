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

interface DocumentWithWorkflow {
  id: string
  title: string
  type: string
  currentStatus: string
  currentVersionId: string | null
  createdAt: string
  updatedAt: string
  priority: string
  createdBy: {
    id: string
    username: string
    name: string
    role: string
  }
  departments: Array<{
    department: {
      id: string
      name: string
    }
  }>
  workflowInstances: Array<{
    id: string
    currentStep: number
    startedAt: string
    completedAt: string | null
    steps: Array<{
      id: string
      stepOrder: number
      departmentId: string | null
      role: string
      status: string
      completedAt: string | null
      comment: string | null
      department: {
        id: string
        name: string
      } | null
      assignedTo: {
        id: string
        name: string
      }
    }>
  }>
}

interface DocumentWithUserInfo extends DocumentWithWorkflow {
  canInteract: boolean
  userDepartmentStep: {
    stepOrder: number
    departmentName: string
    requiredRole: string
    stepStatus: string
    isCurrentStep: boolean
  } | null
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
        workflowInstances: {
          include: {
            steps: {
              include: {
                department: {
                  select: {
                    id: true,
                    name: true
                  }
                },
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
      },
      orderBy: {
        updatedAt: 'desc'
      }
    })

    const documentsWithPermissions: DocumentWithUserInfo[] = documents.map((doc: any) => {
      const workflowInstance = doc.workflowInstances[0]
      if (!workflowInstance) {
        return {
          ...doc,
          canInteract: false,
          userDepartmentStep: null
        }
      }

      const userDepartmentSteps = workflowInstance.steps.filter((step: any) =>
        step.departmentId && userDepartmentIds.includes(step.departmentId)
      )

      let canInteract = false
      let userDepartmentStep = null

      for (const step of userDepartmentSteps) {
        const hasRequiredRole = step.role === user.role || user.role === 'ADMIN'
        const isCurrentStep = step.stepOrder === workflowInstance.currentStep
        const isPending = step.status === 'PENDING' || step.status === 'IN_PROGRESS'

        if (hasRequiredRole && isCurrentStep && isPending) {
          canInteract = true
          userDepartmentStep = {
            stepOrder: step.stepOrder,
            departmentName: step.department?.name || 'Unknown',
            requiredRole: step.role,
            stepStatus: step.status,
            isCurrentStep
          }
          break
        } else if (hasRequiredRole) {
          userDepartmentStep = {
            stepOrder: step.stepOrder,
            departmentName: step.department?.name || 'Unknown',
            requiredRole: step.role,
            stepStatus: step.status,
            isCurrentStep
          }
        }
      }

      return {
        ...doc,
        canInteract,
        userDepartmentStep
      }
    })

    const pendingDocuments = documentsWithPermissions.filter(
      (doc: DocumentWithUserInfo) => doc.canInteract || doc.userDepartmentStep?.stepStatus === 'PENDING'
    )

    return NextResponse.json({
      documents: pendingDocuments,
      allDocuments: documentsWithPermissions
    })
  } catch (error) {
    console.error('Get my documents error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
