import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, getTokenFromRequest } from '@/lib/auth'

// GET /api/admin/departments/[id] - Get department details (admin only)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromRequest(request)
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = verifyToken(token)
    if (!payload || payload.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { id } = await params
    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            username: true,
            name: true,
            role: true,
            createdAt: true
          }
        },
        workflowSteps: {
          select: {
            id: true,
            stepOrder: true,
            status: true
          }
        },
        _count: {
          select: {
            users: true,
            workflowSteps: true
          }
        }
      }
    })

    if (!department) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 })
    }

    return NextResponse.json({ department })
  } catch (error) {
    console.error('Error fetching department:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/admin/departments/[id] - Update department (admin only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromRequest(request)
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = verifyToken(token)
    if (!payload || payload.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { name, description } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Department name is required' },
        { status: 400 }
      )
    }

    const { id } = await params

    // Check if name is taken by another department
    const existingDepartment = await prisma.department.findFirst({
      where: {
        name,
        id: { not: id }
      }
    })

    if (existingDepartment) {
      return NextResponse.json(
        { error: 'Department with this name already exists' },
        { status: 409 }
      )
    }

    const department = await prisma.department.update({
      where: { id },
      data: {
        name,
        description
      }
    })

    return NextResponse.json({ department })
  } catch (error) {
    console.error('Error updating department:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/admin/departments/[id] - Delete department (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromRequest(request)
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = verifyToken(token)
    if (!payload || payload.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { id } = await params

    console.log('Attempting to delete department:', id)

    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            workflowSteps: true
          }
        }
      }
    })

    if (!department) {
      console.log('Department not found:', id)
      return NextResponse.json({ error: 'Department not found' }, { status: 404 })
    }

    console.log('Department found:', department.name, 'users:', department._count.users, 'workflow steps:', department._count.workflowSteps)

    // Check if department is used in active workflow steps
    if (department._count.workflowSteps > 0) {
      console.log('Cannot delete - has workflow steps')
      return NextResponse.json(
        { error: 'Cannot delete department that is used in workflow steps' },
        { status: 400 }
      )
    }

    // Use raw SQL to delete the department and clean up relations
    // This is more reliable for many-to-many relations in SQLite
    console.log('Using raw SQL approach for department deletion...')

    try {
      // Delete from the junction table first, then from departments table
      await prisma.$executeRaw`
        DELETE FROM _UserDepartments WHERE B = ${id}
      `

      console.log('Cleaned up user-department relations')

      // Now delete the department
      await prisma.department.delete({
        where: { id }
      })

      console.log('Department deleted successfully')
    } catch (rawSqlError) {
      console.error('Raw SQL deletion failed:', rawSqlError)

      // Fallback to the Prisma relation approach
      try {
        console.log('Trying Prisma relation cleanup...')

        // Find users with this department
        const usersWithDepartment = await prisma.user.findMany({
          where: {
            departments: {
              some: {
                id: id
              }
            }
          },
          select: {
            id: true
          }
        })

        console.log(`Found ${usersWithDepartment.length} users with this department`)

        // Use transaction to update all users and delete department
        await prisma.$transaction(async (tx: any) => {
          // Update each user to remove this department
          for (const user of usersWithDepartment) {
            await tx.user.update({
              where: { id: user.id },
              data: {
                departments: {
                  set: [] // Clear all departments, then we'll handle this properly
                }
              }
            })

            // Reconnect all other departments (this is a workaround)
            const userWithDepartments = await tx.user.findUnique({
              where: { id: user.id },
              select: {
                departments: {
                  where: {
                    id: {
                      not: id
                    }
                  },
                  select: {
                    id: true
                  }
                }
              }
            })

            if (userWithDepartments && userWithDepartments.departments.length > 0) {
              await tx.user.update({
                where: { id: user.id },
                data: {
                  departments: {
                    set: userWithDepartments.departments
                  }
                }
              })
            }
          }

          // Delete the department
          await tx.department.delete({
            where: { id }
          })
        })

        console.log('Department deleted via Prisma transaction fallback')
      } catch (prismaError) {
        console.error('Prisma fallback also failed:', prismaError)
        throw prismaError
      }
    }

    return NextResponse.json({ message: 'Department deleted successfully' })
  } catch (error) {
    console.error('Error deleting department:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}