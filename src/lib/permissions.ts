export function canUserEditDocument(userRole: string, documentStatus: string, authorId: string, userId: string): boolean {
  if (documentStatus === 'FINAL') return false
  if (documentStatus === 'FOR_REVIEW' || documentStatus === 'APPROVED') {
    return userRole === 'ADMIN' || authorId === userId
  }
  return true
}

export function canUserApproveDocument(userRole: string, userId: string, assignedToId: string): boolean {
  return userRole === 'REVIEWER' || userRole === 'APPROVER' || userRole === 'ADMIN'
}

export function canUserSubmitDocument(documentStatus: string, authorId: string, userId: string): boolean {
  if (documentStatus !== 'DRAFT') return false
  return authorId === userId
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-800',
    FOR_REVIEW: 'bg-blue-100 text-blue-800',
    APPROVED: 'bg-green-100 text-green-800',
    CHANGES_REQUESTED: 'bg-yellow-100 text-yellow-800',
    FINAL: 'bg-purple-100 text-purple-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    FOR_REVIEW: 'For Review',
    APPROVED: 'Approved',
    CHANGES_REQUESTED: 'Changes Requested',
    FINAL: 'Final',
  }
  return labels[status] || status
}
