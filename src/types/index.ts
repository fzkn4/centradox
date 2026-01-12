export interface User {
  id: string
  email: string
  name: string
  role: string
  department: string
}

export interface Document {
  id: string
  title: string
  type: string
  currentStatus: string
  currentVersionId: string | null
  lockedBy: string | null
  createdAt: string
  updatedAt: string
  createdBy: User
}

export interface DocumentVersion {
  id: string
  versionNumber: number
  fileName: string
  fileSize: number
  mimeType: string
  filePath: string
  createdAt: string
  documentId: string
  createdBy: User
}

export interface WorkflowStep {
  id: string
  stepOrder: number
  department: string | null
  role: string
  status: string
  completedAt: Date | null
  comment: string | null
  workflowInstanceId: string
  assignedToId: string
}

export interface Comment {
  id: string
  text: string
  createdAt: string
  documentId: string
  authorId: string
  author: User
}

export interface CreateDocumentData {
  title: string
  type: string
  file: File
  userId: string
}

export interface UpdateDocumentData {
  id: string
  title?: string
  type?: string
  file?: File
  userId: string
}

export interface WorkflowAction {
  documentId: string
  userId: string
  action: 'submit' | 'approve' | 'request-changes'
  comment?: string
}
