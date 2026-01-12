# Centradox - Document Approval Workflow System

A modern document approval workflow management system built with Next.js, TypeScript, Prisma, and PostgreSQL.

## Features

- **Document Management**: Create, edit, and version documents with rich text editing
- **Approval Workflow**: Route documents through departments for review/approval
- **Role-Based Access**: Author, Reviewer, Approver, and Admin roles
- **Comments & Collaboration**: Add comments to documents
- **Status Tracking**: Track document status (Draft, For Review, Approved, Changes Requested, Final)
- **Workflow Progress**: Visual workflow timeline showing approval stages
- **Modern UI**: Clean, responsive interface built with Tailwind CSS

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT tokens with bcrypt password hashing
- **Rich Text Editor**: TipTap
- **State Management**: Zustand
- **Date Handling**: date-fns

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository and navigate to the project directory

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and update the following variables:
```
 DATABASE_URL="file:./prisma/dev.db"
JWT_SECRET="your-secret-key-change-in-production"
JWT_EXPIRES_IN="7d"
APP_URL="http://localhost:3000"
```

4. Generate Prisma Client:
```bash
npm run db:generate
```

5. Push database schema:
```bash
npm run db:push
```

### Running the Application

Development mode:
```bash
npm run dev
```

  The application will be available at `http://localhost:3000`

Note: A default admin account is automatically created with username 'admin' and password 'password123'. Remember to change the password after first login!

## Project Structure

```
centradox/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── seed.ts              # Database seeding script
├── src/
│   ├── app/
│   │   ├── api/             # API routes
│   │   │   ├── auth/        # Authentication endpoints
│   │   │   └── documents/   # Document CRUD & workflow
│   │   ├── dashboard/        # Dashboard page
│   │   ├── documents/       # Document pages
│   │   └── login/           # Login page
│   ├── components/
│   │   ├── documents/       # Document-related components
│   │   └── layout/         # Layout components
│   ├── lib/
│   │   ├── auth.ts         # Authentication utilities
│   │   ├── email.ts        # Email notifications
│   │   ├── permissions.ts  # Permission helpers
│   │   ├── prisma.ts       # Prisma client
│   │   └── store.ts        # Zustand state management
│   └── types/
│       └── index.ts        # TypeScript types
└── public/                 # Static assets
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login

### Documents
- `GET /api/documents` - List documents (supports filters)
- `POST /api/documents` - Create new document
- `GET /api/documents/:id` - Get document details
- `PUT /api/documents/:id` - Update document
- `DELETE /api/documents/:id` - Delete document
- `POST /api/documents/:id/workflow` - Perform workflow actions (submit, approve, request-changes)
- `GET /api/documents/:id/comments` - Get document comments
- `POST /api/documents/:id/comments` - Add comment

## Workflow States

Documents go through the following states:
1. **DRAFT** - Author is editing the document
2. **FOR_REVIEW** - Document submitted for review
3. **APPROVED** - Document has been approved through all workflow steps
4. **CHANGES_REQUESTED** - Reviewer requested changes, back to author
5. **FINAL** - Document is locked and finalized

## Roles and Permissions

- **AUTHOR**: Create and edit documents, submit for review
- **REVIEWER**: Review documents assigned to them, request changes
- **APPROVER**: Approve documents assigned to them
- **ADMIN**: Full access to all documents and administrative functions

## License

ISC
