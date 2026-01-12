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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const comments = await prisma.comment.findMany({
      where: { documentId: id },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json({ comments })
  } catch (error) {
    console.error('Get comments error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
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
    const body = await request.json()
    const { text } = body

    if (!text) {
      return NextResponse.json(
        { error: 'Comment text is required' },
        { status: 400 }
      )
    }

    const comment = await prisma.comment.create({
      data: {
        text,
        documentId: id,
        authorId: user.userId
      },
      include: {
        author: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    })

    return NextResponse.json({ comment }, { status: 201 })
  } catch (error) {
    console.error('Create comment error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
