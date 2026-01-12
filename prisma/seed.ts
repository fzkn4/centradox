import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  const hashedPassword = await bcrypt.hash('password123', 10)

  const users = await Promise.all([
    prisma.user.upsert({
      where: { username: 'admin' },
      update: {},
      create: {
        username: 'admin',
        name: 'Admin User',
        password: hashedPassword,
        role: 'ADMIN',
        department: 'Management'
      }
    }),
    prisma.user.upsert({
      where: { username: 'author' },
      update: {},
      create: {
        username: 'author',
        name: 'Jane Author',
        password: hashedPassword,
        role: 'AUTHOR',
        department: 'Marketing'
      }
    }),
    prisma.user.upsert({
      where: { username: 'reviewer' },
      update: {},
      create: {
        username: 'reviewer',
        name: 'Bob Reviewer',
        password: hashedPassword,
        role: 'REVIEWER',
        department: 'Finance'
      }
    }),
    prisma.user.upsert({
      where: { username: 'approver' },
      update: {},
      create: {
        username: 'approver',
        name: 'Carol Approver',
        password: hashedPassword,
        role: 'APPROVER',
        department: 'Legal'
      }
    })
  ])

   console.log('✅ Database seeded successfully!')
   console.log('\n👤 Default Admin Account:')
   console.log('Username: admin')
   console.log('Password: password123')
   console.log('\n📝 No documents seeded - create documents by uploading files from the UI')
   console.log('\n⚠️  Remember to change the default admin password after first login!')
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
