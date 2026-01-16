import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  const hashedPassword = await bcrypt.hash('password123', 10)

  // Create departments
  const departments = await Promise.all([
    prisma.department.upsert({
      where: { name: 'Management' },
      update: {},
      create: {
        name: 'Management',
        description: 'Executive and administrative management'
      }
    }),
    prisma.department.upsert({
      where: { name: 'Marketing' },
      update: {},
      create: {
        name: 'Marketing',
        description: 'Marketing and communications'
      }
    }),
    prisma.department.upsert({
      where: { name: 'Finance' },
      update: {},
      create: {
        name: 'Finance',
        description: 'Financial operations and accounting'
      }
    }),
    prisma.department.upsert({
      where: { name: 'Legal' },
      update: {},
      create: {
        name: 'Legal',
        description: 'Legal affairs and compliance'
      }
    })
  ])

   const users = await Promise.all([
     prisma.user.upsert({
       where: { username: 'admin' },
       update: {},
       create: {
         username: 'admin',
         name: 'Admin User',
         password: hashedPassword,
         role: 'ADMIN',
         departments: {
           connect: [{ name: 'Management' }]
         }
       }
     }),
     prisma.user.upsert({
       where: { username: 'editor' },
       update: {},
       create: {
         username: 'editor',
         name: 'Jane Editor',
         password: hashedPassword,
         role: 'EDITOR',
         departments: {
           connect: [{ name: 'Marketing' }]
         }
       }
     }),
     prisma.user.upsert({
       where: { username: 'approver' },
       update: {},
       create: {
         username: 'approver',
         name: 'Bob Approver',
         password: hashedPassword,
         role: 'APPROVER',
         departments: {
           connect: [{ name: 'Finance' }]
         }
       }
     }),
     prisma.user.upsert({
       where: { username: 'approver2' },
       update: {},
       create: {
         username: 'approver2',
         name: 'Carol Approver',
         password: hashedPassword,
         role: 'APPROVER',
         departments: {
           connect: [{ name: 'Legal' }]
         }
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
