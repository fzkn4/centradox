const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  console.log('Starting migration script...')

  // 1. Update Users: EDITOR -> DRAFTER
  // Prisma's generated client might not let us do `role: 'EDITOR'` if we run this after regenerating 
  // without EDITOR in the schema. In SQLite, we can just execute raw SQL to be completely safe against enum checks.
  
  console.log('Migrating Users...')
  await prisma.$executeRaw`UPDATE User SET role = 'DRAFTER' WHERE role = 'EDITOR'`
  console.log('Users updated.')

  // 2. Update WorkflowSteps: EDITOR -> DRAFTER
  console.log('Migrating Workflow Steps...')
  await prisma.$executeRaw`UPDATE WorkflowStep SET role = 'DRAFTER' WHERE role = 'EDITOR'`
  console.log('Workflow Steps updated.')

  console.log('✅ Migration successful.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
