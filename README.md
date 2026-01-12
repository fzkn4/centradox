# Centradox - Document Approval Workflow System

A modern document approval workflow management system built with Next.js, TypeScript, Prisma, and SQLite.

## Features

- **Document Management**: Create, edit, and version documents with rich text editing
- **Approval Workflow**: Route documents through departments for review/approval
- **Department Management**: Create and manage organizational departments (Admin only)
- **User-Department Assignment**: Assign users to multiple departments for organized workflows
- **Role-Based Access**: Author, Reviewer, Approver, and Admin roles
- **Comments & Collaboration**: Add comments to documents
- **Status Tracking**: Track document status (Draft, For Review, Approved, Changes Requested, Final)
- **Workflow Progress**: Visual workflow timeline showing approval stages
- **User Management**: Comprehensive admin interface for managing users and their department assignments
- **Security-First**: No public registration - accounts created by administrators only
- **Modern UI**: Clean, responsive interface built with Tailwind CSS

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS 4.1
- **Database**: SQLite with Prisma ORM
- **Authentication**: JWT tokens with bcrypt password hashing
- **Rich Text Editor**: TipTap
- **State Management**: Zustand
- **Email**: Nodemailer (for notifications)
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
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-secret-key-change-in-production"
JWT_EXPIRES_IN="7d"
APP_URL="http://localhost:3000"

# Optional: Email configuration for notifications
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
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

6. Seed the database with default admin account and departments:
```
npm run db:seed
```

**Default Admin Account:**
- Username: `admin`
- Password: `password123`
- **Important**: Change the default password after first login for security!

**Seeded Data:**
- Default admin user assigned to Management department
- Sample users in Marketing, Finance, and Legal departments
- Four default departments: Management, Marketing, Finance, Legal

**Security Note**: This application uses a secure, invite-only registration system. The `/register` endpoint has been removed to prevent unauthorized account creation. All user accounts must be created by administrators.

## Testing

Currently no automated test suite. Manual testing:
1. Run `npm run db:seed` to create default admin account (admin/password123)
2. Start dev server: `npm run dev`
3. Visit http://localhost:3000 and login with admin/password123
4. Test user management and department assignment features
5. Verify API responses in Network tab

## Agent Instructions

This project includes an `AGENTS.md` file with detailed instructions and guidelines for AI coding agents working on this codebase. Refer to this file for development standards, code style guidelines, and workflow procedures.

## Project Structure

```
centradox/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── seed.ts              # Database seeding script
├── src/
│   ├── app/
│   │   ├── admin/           # Admin pages
│   │   │   ├── departments/ # Department management
│   │   │   └── users/       # User management
│   │   ├── api/             # API routes
│   │   │   ├── admin/       # Admin endpoints
│   │   │   │   ├── departments/ # Department CRUD
│   │   │   │   └── users/   # User management
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
│   │   ├── email.ts        # Email notification helpers
│   │   ├── permissions.ts  # Permission helpers
│   │   ├── prisma.ts       # Prisma client
│   │   └── store.ts        # Zustand state management
│   └── types/
│       └── index.ts        # TypeScript types
├── public/                 # Static assets
├── AGENTS.md               # Agent instructions and guidelines
└── README.md              # This file
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

### Admin - User Management
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create new user
- `GET /api/admin/users/:id` - Get user details
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user

### Admin - Department Management
- `GET /api/admin/departments` - List all departments
- `POST /api/admin/departments` - Create new department
- `GET /api/admin/departments/:id` - Get department details
- `PUT /api/admin/departments/:id` - Update department
- `DELETE /api/admin/departments/:id` - Delete department

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
- **ADMIN**:
  - Full access to all documents and administrative functions
  - Create/manage user accounts and department assignments
  - Create/manage organizational departments
  - View system-wide statistics and user activity

## Department Management

Centradox supports organizational departments to better structure workflows and user management:

### Department Features
- **Create Departments**: Admins can create departments with names and descriptions
- **User Assignment**: Users can be assigned to multiple departments
- **Department-Based Workflows**: Documents can be routed through department-specific approval processes
- **Organized User Management**: Filter and manage users by department

### Default Departments (Seeded)
- **Management**: Executive and administrative management
- **Marketing**: Marketing and communications
- **Finance**: Financial operations and accounting
- **Legal**: Legal affairs and compliance

## Security Features

- **Username-based Authentication**: No email addresses required for login
- **JWT Token Authentication**: Secure token-based sessions
- **Password Hashing**: bcrypt with salt rounds for secure password storage
- **No Public Registration**: Invite-only system prevents unauthorized account creation
- **Admin-Only Account Management**: Only administrators can create new user accounts

## License

ISC
