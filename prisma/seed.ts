import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  const hashedPassword = await bcrypt.hash('password123', 10)

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'admin@example.com' },
      update: {},
      create: {
        email: 'admin@example.com',
        name: 'Admin User',
        password: hashedPassword,
        role: 'ADMIN',
        department: 'Management'
      }
    }),
    prisma.user.upsert({
      where: { email: 'author@example.com' },
      update: {},
      create: {
        email: 'author@example.com',
        name: 'Jane Author',
        password: hashedPassword,
        role: 'AUTHOR',
        department: 'Marketing'
      }
    }),
    prisma.user.upsert({
      where: { email: 'reviewer@example.com' },
      update: {},
      create: {
        email: 'reviewer@example.com',
        name: 'Bob Reviewer',
        password: hashedPassword,
        role: 'REVIEWER',
        department: 'Finance'
      }
    }),
    prisma.user.upsert({
      where: { email: 'approver@example.com' },
      update: {},
      create: {
        email: 'approver@example.com',
        name: 'Carol Approver',
        password: hashedPassword,
        role: 'APPROVER',
        department: 'Legal'
      }
    })
  ])

  console.log('✅ Database seeded successfully!')
  console.log('\n📧 Test Accounts:')
  console.log('Admin: admin@example.com / password123')
  console.log('Author: author@example.com / password123')
  console.log('Reviewer: reviewer@example.com / password123')
  console.log('Approver: approver@example.com / password123')
  console.log('\n📝 No documents seeded - create documents by uploading files from the UI')
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
