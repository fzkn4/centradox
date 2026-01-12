"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = require("bcryptjs");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Seeding database...');
    const hashedPassword = await bcryptjs_1.default.hash('password123', 10);
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
    ]);
    const author = users[1];
    const reviewer = users[2];
    const approver = users[3];
    const documents = await Promise.all([
        prisma.document.create({
            data: {
                title: 'Q1 Marketing Strategy Proposal',
                type: 'Proposal',
                currentStatus: 'DRAFT',
                createdById: author.id,
                currentVersionId: '',
                versions: {
                    create: {
                        versionNumber: 1,
                        content: '<h1>Q1 Marketing Strategy</h1><p>This document outlines our marketing strategy for Q1...</p>',
                        createdById: author.id
                    }
                },
                comments: {
                    create: {
                        text: 'Great start! Looking forward to seeing more details.',
                        authorId: reviewer.id
                    }
                }
            }
        }),
        prisma.document.create({
            data: {
                title: 'Annual Budget Report',
                type: 'Report',
                currentStatus: 'FOR_REVIEW',
                createdById: author.id,
                versions: {
                    create: {
                        versionNumber: 1,
                        content: '<h1>Annual Budget Report</h1><p>Our projected expenses for the upcoming fiscal year...</p>',
                        createdById: author.id
                    }
                },
                workflowInstances: {
                    create: {
                        currentStep: 1,
                        steps: {
                            create: [
                                {
                                    stepOrder: 1,
                                    role: 'REVIEWER',
                                    assignedToId: reviewer.id,
                                    status: 'IN_PROGRESS'
                                },
                                {
                                    stepOrder: 2,
                                    role: 'APPROVER',
                                    assignedToId: approver.id,
                                    status: 'PENDING'
                                }
                            ]
                        }
                    }
                }
            }
        }),
        prisma.document.create({
            data: {
                title: 'Employee Handbook Updates',
                type: 'Policy',
                currentStatus: 'APPROVED',
                createdById: author.id,
                versions: {
                    create: {
                        versionNumber: 1,
                        content: '<h1>Employee Handbook</h1><p>Updated policies for remote work...</p>',
                        createdById: author.id
                    }
                },
                workflowInstances: {
                    create: {
                        currentStep: 999,
                        completedAt: new Date(),
                        steps: {
                            create: [
                                {
                                    stepOrder: 1,
                                    role: 'REVIEWER',
                                    assignedToId: reviewer.id,
                                    status: 'COMPLETED',
                                    completedAt: new Date()
                                },
                                {
                                    stepOrder: 2,
                                    role: 'APPROVER',
                                    assignedToId: approver.id,
                                    status: 'COMPLETED',
                                    completedAt: new Date()
                                }
                            ]
                        }
                    }
                }
            }
        }),
        prisma.document.create({
            data: {
                title: 'Contract Template v2',
                type: 'Contract',
                currentStatus: 'CHANGES_REQUESTED',
                createdById: author.id,
                versions: {
                    create: {
                        versionNumber: 1,
                        content: '<h1>Contract Template</h1><p>This is a revised contract template...</p>',
                        createdById: author.id
                    }
                },
                workflowInstances: {
                    create: {
                        currentStep: 1,
                        steps: {
                            create: [
                                {
                                    stepOrder: 1,
                                    role: 'REVIEWER',
                                    assignedToId: reviewer.id,
                                    status: 'PENDING',
                                    comment: 'Please review the payment terms section'
                                }
                            ]
                        }
                    }
                }
            }
        })
    ]);
    for (const doc of documents) {
        const version = await prisma.documentVersion.findFirst({
            where: { documentId: doc.id }
        });
        if (version) {
            await prisma.document.update({
                where: { id: doc.id },
                data: { currentVersionId: version.id }
            });
        }
    }
    console.log('✅ Database seeded successfully!');
    console.log('\n📧 Test Accounts:');
    console.log('Admin: admin@example.com / password123');
    console.log('Author: author@example.com / password123');
    console.log('Reviewer: reviewer@example.com / password123');
    console.log('Approver: approver@example.com / password123');
}
main()
    .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
