# AGENTS.md

This file provides guidelines and instructions for agentic coding agents working on this repository.

## Build Commands

### Development
- `npm run dev` - Start development server at http://localhost:3000
- `npm run build` - Build production bundle
- `npm start` - Start production server
- `npm run lint` - Run ESLint

### Database
- `npm run db:generate` - Generate Prisma client after schema changes
- `npm run db:push` - Push schema changes to database (destructive, dev only)
- `npm run db:migrate` - Create and run migrations
- `npm run db:seed` - Seed database with test data (manual registration required)

## Code Style Guidelines

### Tech Stack
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript 5.9
- **Database**: SQLite with Prisma ORM
- **Styling**: Tailwind CSS 4.1
- **Auth**: JWT tokens with bcryptjs
- **State**: Zustand
- **Editor**: TipTap
- **Email**: Nodemailer

### TypeScript
- Strict mode enabled in tsconfig.json
- All files use `.ts` or `.tsx` extensions
- Type all function parameters and return values explicitly
- Use interfaces for objects, types for unions/primitives
- Avoid `any` type - use `unknown` or proper types
- Use Prisma-generated types for database models

### React/Next.js Components
- Functional components with hooks
- `'use client'` directive for client components
- Async server components for data fetching
- State management: Zustand for global, React hooks for local
```typescript
'use client'
import { useState } from 'react'

export default function Component() {
  const [count, setCount] = useState(0)
  return <div>{count}</div>
}
```

### API Routes
- Place in `/src/app/api/[resource]/route.ts`
- Use GET, POST, PUT, DELETE named exports
- Always include try-catch blocks
- Return proper HTTP status codes (200, 201, 400, 401, 403, 404, 500)
- Authenticate with `getTokenFromRequest()` from `/src/lib/auth.ts`

### Database (Prisma)
- Import client from `/src/lib/prisma.ts`
- Use transactions for multi-step operations
- Handle errors gracefully
```typescript
import { prisma } from '@/lib/prisma'

const documents = await prisma.document.findMany({
  where: { currentStatus: 'DRAFT' },
  include: { createdBy: true },
  orderBy: { createdAt: 'desc' }
})
```

### Naming Conventions
- **Files**: kebab-case for utilities (e.g., `auth.ts`), PascalCase for components
- **Variables/Functions**: camelCase (e.g., `getUserById`, `documentId`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `DATABASE_URL`)
- **Types/Interfaces**: PascalCase (e.g., `Document`, `User`)

### Imports and Exports
- ES6 import/export syntax
- Group: external libraries first, then internal modules
- Absolute imports with `@/` alias for src directory
```typescript
import { useState } from 'react'
import { prisma } from '@/lib/prisma'
import { useAuthStore } from '@/lib/store'
```

### Error Handling
- Try-catch blocks for async operations
- Log errors with context: `console.error('Operation failed:', error)`
- Return user-friendly error messages
- Proper HTTP status codes in API responses

### Authentication & Authorization
- JWT tokens in `Authorization: Bearer <token>` header
- Permission helpers in `/src/lib/permissions.ts`:
  - `canUserEditDocument()` - EDITOR and ADMIN can edit documents
  - `canUserApproveDocument()` - APPROVER and ADMIN can approve documents
  - `canUserSubmitDocument()` - Document authors can submit for review
- Roles: ADMIN, EDITOR, APPROVER

### Styling
- Tailwind CSS utility-first approach
- Mobile-first responsive design (`md:`, `lg:` breakpoints)
- Gray scale for neutrals, indigo-600 for primary actions
- Self-contained component styles

### File Organization
- API routes: `/src/app/api/[resource]/[action]/route.ts`
- Pages: `/src/app/[route]/page.tsx`
- Components: `/src/components/[category]/[ComponentName].tsx`
- Utilities: `/src/lib/[name].ts`
- Types: `/src/types/index.ts`
- Database: `/prisma/schema.prisma`

## Workflow Implementation

- **Document Flow**: DRAFT → FOR_REVIEW → APPROVED → FINAL
- **With Changes**: DRAFT → FOR_REVIEW → CHANGES_REQUESTED → DRAFT
- Workflow steps created on document submission
- Each step: assigned user, status (PENDING/IN_PROGRESS/COMPLETED), optional comment
- Current step tracked in WorkflowInstance.currentStep
- Email notifications via `/src/lib/email.ts`

## Common Patterns

### Authenticated Fetch
```typescript
const response = await fetch('/api/documents', {
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
})
```

### Protected Component
```typescript
'use client'
import { useAuthStore } from '@/lib/store'

export default function ProtectedPage() {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return null
  return <div>Protected content</div>
}
```

### Prisma Transaction
```typescript
await prisma.$transaction(async (tx) => {
  const doc = await tx.document.create({ ... })
  await tx.workflowInstance.create({ ... })
  return doc
})
```

## Technology Notes

- **TipTap Editor**: Initialize with extensions, content, editable state
- **bcryptjs**: Password hashing with 10 salt rounds
- **jsonwebtoken**: JWT generation/verification
- **date-fns**: Date formatting (format(date, 'MMM dd, yyyy'))

## Testing

Currently no automated test suite. Manual testing:
1. Run `npm run db:seed` to create default admin account (admin/password123)
2. Start dev server: `npm run dev`
3. Visit http://localhost:3000 and login with admin/password123
4. Test with seeded accounts, check browser console
5. Verify API responses in Network tab

## Environment Variables

- Never commit `.env` files
- Required: DATABASE_URL, JWT_SECRET
- Optional: SMTP_* for email, APP_URL
- Access via `process.env.VARIABLE_NAME`
