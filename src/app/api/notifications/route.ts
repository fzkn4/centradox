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

    // For non-admins, filter by department
    let whereCondition: any = { userId: user.userId }
    if (user.role !== 'ADMIN') {
      const userWithDepartments = await prisma.user.findUnique({
        where: { id: user.userId },
        include: {
          departments: {
            select: { id: true }
          }
        }
      })

      if (userWithDepartments && userWithDepartments.departments.length > 0) {
        const departmentIds = userWithDepartments.departments.map((d: any) => d.id)
        whereCondition = {
          OR: [
            { userId: user.userId }, // User's direct notifications
            {
              AND: [
                { userId: { not: user.userId } }, // Others' notifications
                 {
                  document: {
                    departments: {
                      some: {
                        departmentId: { in: departmentIds }
                      }
                    }
                  }
                }
              ]
            }
          ]
        }
      }
    }

    const notifications = await prisma.notification.findMany({
      where: whereCondition,
      include: {
        document: {
          select: {
            departments: {
              include: {
                department: {
                  select: { name: true }
                }
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
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