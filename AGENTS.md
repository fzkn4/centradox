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
- `npm run db:seed` - Seed database with test data

## Code Style Guidelines

### Imports and Exports
- Use ES6 import/export syntax
- Group imports: external libraries first, internal modules second
- Absolute imports use `@/` alias for src directory
```typescript
import { useState, useEffect } from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { useAuthStore } from '@/lib/store'
```

### TypeScript
- All files must be `.ts` or `.tsx` extensions
- Use strict mode (enabled in tsconfig.json)
- Type all function parameters and return values explicitly
- Use interfaces for object shapes, types for unions/primitives
- Avoid `any` type - use `unknown` or proper types instead
- Use Prisma-generated types when working with database models

### React/Next.js Components
- Use functional components with hooks
- Use `'use client'` directive for client components that use hooks
- Use async server components for data fetching when possible
- Client-side data fetching should use `useEffect` or SWR patterns
- State management uses Zustand (see `/src/lib/store.ts`)
```typescript
'use client'

import { useState } from 'react'

export default function Component() {
  const [count, setCount] = useState(0)
  
  return <div>{count}</div>
}
```

### API Routes
- Place API routes in `/src/app/api/[resource]/route.ts`
- Use Next.js App Router conventions (GET, POST, PUT, DELETE named exports)
- Always include error handling with try-catch blocks
- Return proper HTTP status codes: 200 (OK), 201 (Created), 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found), 500 (Internal Server Error)
- Authenticate users using `getTokenFromRequest()` and `verifyToken()` from `/src/lib/auth.ts`
- Example structure:
```typescript
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // ... logic
    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### Database (Prisma)
- Import Prisma client from `/src/lib/prisma.ts`
- Use Prisma-generated types for type safety
- Always use transactions for multi-step operations
- Handle database errors gracefully
- Example queries:
```typescript
import { prisma } from '@/lib/prisma'

const documents = await prisma.document.findMany({
  where: { currentStatus: 'DRAFT' },
  include: { createdBy: true },
  orderBy: { createdAt: 'desc' }
})

await prisma.document.create({
  data: {
    title: 'New Doc',
    createdById: userId,
    versions: { create: { ... } }
  }
})
```

### Naming Conventions
- **Files**: kebab-case for non-component files (e.g., `auth.ts`, `document-service.ts`), PascalCase for components
- **Variables**: camelCase (e.g., `documentId`, `currentStatus`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `DATABASE_URL`, `JWT_SECRET`)
- **Functions**: camelCase with verb-first naming (e.g., `getUserById`, `createDocument`, `submitForReview`)
- **Types/Interfaces**: PascalCase (e.g., `Document`, `User`, `WorkflowAction`)

### Error Handling
- Always include try-catch blocks for async operations
- Log errors with context: `console.error('Operation failed:', error)`
- Return user-friendly error messages via API responses
- Use proper HTTP status codes in API responses
- Client-side errors should be displayed to users via state

### State Management
- Use Zustand for global state (`/src/lib/store.ts`)
- Local state: React hooks (`useState`, `useReducer`)
- Server state: Next.js server components and API routes
- Avoid prop drilling - use Zustand or context for shared state

### Styling
- Use Tailwind CSS for all styling
- Utility-first approach with standard Tailwind classes
- Responsive design: mobile-first with `md:`, `lg:` breakpoints
- Colors: use gray scale for neutrals, indigo-600 for primary actions
- Spacing: Tailwind spacing scale (2, 4, 8, etc.)
- Components should be self-contained with their styles

### Authentication & Authorization
- All API routes must authenticate using JWT tokens from `Authorization: Bearer <token>` header
- Use `getTokenFromRequest()` and `verifyToken()` utilities
- Check permissions using `/src/lib/permissions.ts` helpers:
  - `canUserEditDocument()`
  - `canUserApproveDocument()`
  - `canUserSubmitDocument()`
- Role-based access: check user.role against 'AUTHOR', 'REVIEWER', 'APPROVER', 'ADMIN'

### Testing
- Run `npm run lint` before committing
- Test API endpoints with curl or Postman
- Use seeded test accounts (from `npm run db:seed`)

### File Organization
- API routes: `/src/app/api/[resource]/[action]/route.ts`
- Pages: `/src/app/[route]/page.tsx`
- Components: `/src/components/[category]/[ComponentName].tsx`
- Utilities: `/src/lib/[name].ts`
- Types: `/src/types/index.ts`
- Database: `/prisma/schema.prisma`

### Comments
- Add comments only when logic is complex or non-obvious
- Use `//` for single-line, `/* */` for multi-line
- Document API routes with endpoint purpose, parameters, and responses

### Environment Variables
- Never commit `.env` or `.env.local`
- Use `.env.example` as template
- Access via `process.env.VARIABLE_NAME`
- Required: DATABASE_URL, JWT_SECRET
- Optional: SMTP_* for email, APP_URL

### Workflow Implementation Notes
- Documents flow: DRAFT → FOR_REVIEW → APPROVED → FINAL
- Or with changes: DRAFT → FOR_REVIEW → CHANGES_REQUESTED → (back to DRAFT)
- Workflow steps are created when document is submitted
- Each step has assigned user, status (PENDING/IN_PROGRESS/COMPLETED), and optional comment
- Current step tracked in WorkflowInstance.currentStep
- Notifications sent on status changes via `/src/lib/email.ts`

## Common Patterns

### Fetching with Authentication
```typescript
const response = await fetch('/api/documents', {
  headers: {
    Authorization: `Bearer ${localStorage.getItem('token')}`
  }
})
```

### Protected Client Component
```typescript
'use client'
import { useEffect } from 'react'
import { useAuthStore } from '@/lib/store'

export default function ProtectedPage() {
  const { isAuthenticated } = useAuthStore()
  
  useEffect(() => {
    if (!isAuthenticated) {
      window.location.href = '/login'
    }
  }, [isAuthenticated])
  
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

## Specific Technology Notes

- **TipTap Editor**: Initialize with extensions, content, and editable state. Use EditorContent component for rendering.
- **bcryptjs**: Use for password hashing (10 rounds salt). Never store plain text passwords.
- **jsonwebtoken**: Use for JWT tokens. Generate with sign(), verify with verify().
- **date-fns**: Use for date formatting (format(date, 'MMM dd, yyyy')).

## Running a Single Test

Currently, no automated test suite is set up. Manual testing:
1. Seed database: `npm run db:seed`
2. Start dev server: `npm run dev`
3. Use test accounts from README to test flows
4. Check browser console for errors
5. Verify API responses in Network tab
