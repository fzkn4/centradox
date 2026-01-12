const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany()
  console.log('Users found:', users.length)
  console.log(JSON.stringify(users.map(u => ({ email: u.email, name: u.name, role: u.role })), null, 2))
  await prisma.$disconnect()
}

main().catch(console.error)
