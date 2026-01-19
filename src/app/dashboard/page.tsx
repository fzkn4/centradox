'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuthStore, useDocumentStore } from '@/lib/store'
import { getStatusColor, getStatusLabel } from '@/lib/permissions'
import { format, differenceInDays, isBefore, isAfter, addDays } from 'date-fns'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { NewDocumentModal } from '@/components/modals/NewDocumentModal'
import { ViewDocumentModal } from '@/components/modals/ViewDocumentModal'

export default function DashboardPage() {
  const { user, isAuthenticated, token, isHydrated } = useAuthStore()
  const { documents, setDocuments, setLoading, isLoading } = useDocumentStore()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')

  const loadDocuments = useCallback(async () => {
    setLoading(true)
    try {
      let url = '/api/documents'
      const params = new URLSearchParams()

      if (filter === 'my') {
        params.append('myDocs', 'true')
      } else if (filter !== 'all') {
        params.append('status', filter)
      }

      if (params.toString()) {
        url += `?${params.toString()}`
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setDocuments(data.documents)
      }
    } catch (error) {
      console.error('Failed to load documents:', error)
    } finally {
      setLoading(false)
    }
  }, [filter, token, setLoading, setDocuments])

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      window.location.href = '/login'
      return
    }
    if (isHydrated && isAuthenticated) {
      loadDocuments()
    }
   }, [isAuthenticated, isHydrated, loadDocuments])

  const stats = useMemo(() => {
    const now = new Date()
    const overdue = documents.filter(doc => {
      if (!doc.deadline) return false

      const deadline = new Date(doc.deadline)
      const isApproved = doc.currentStatus === 'APPROVED' || doc.currentStatus === 'FINAL'

      if (isApproved) {
        // For approved documents, check if completed after deadline
        const completedAt = doc.workflowInstances?.[0]?.completedAt
        return completedAt && new Date(completedAt) > deadline
      } else {
        // For non-approved documents, check if past deadline
        return deadline < now
      }
    })

    const upcoming = documents.filter(doc => {
      if (!doc.deadline) return false

      const deadline = new Date(doc.deadline)
      const daysUntil = differenceInDays(deadline, now)
      const isApproved = doc.currentStatus === 'APPROVED' || doc.currentStatus === 'FINAL'

      // Only count non-approved documents as "due this week"
      return !isApproved && daysUntil >= 0 && daysUntil <= 7
    })

    return {
      total: documents.length,
      drafts: documents.filter(d => d.currentStatus === 'DRAFT').length,
      inReview: documents.filter(d => d.currentStatus === 'FOR_REVIEW' || d.currentStatus === 'CHANGES_REQUESTED').length,
      approved: documents.filter(d => d.currentStatus === 'APPROVED' || d.currentStatus === 'FINAL').length,
      overdue: overdue.length,
      upcoming: upcoming.length,
      urgent: documents.filter(d => d.priority === 'URGENT').length,
      high: documents.filter(d => d.priority === 'HIGH').length
    }
  }, [documents])

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT': return 'bg-red-100 text-red-800 border-red-200'
      case 'HIGH': return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'LOW': return 'bg-green-100 text-green-800 border-green-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getDeadlineStatus = (deadline: string | null) => {
    if (!deadline) return null
    const now = new Date()
    const deadlineDate = new Date(deadline)
    if (deadlineDate < now) return { label: 'Overdue', class: 'text-red-600 bg-red-50' }
    const daysUntil = differenceInDays(deadlineDate, now)
    if (daysUntil <= 3) return { label: 'Due Soon', class: 'text-orange-600 bg-orange-50' }
    if (daysUntil <= 7) return { label: 'Upcoming', class: 'text-yellow-600 bg-yellow-50' }
    return { label: 'On Track', class: 'text-green-600 bg-green-50' }
  }

  const getWorkflowProgress = (doc: any) => {
    const workflow = doc.workflowInstances?.[0]
    if (!workflow || workflow.steps.length === 0) return null
    const completed = workflow.steps.filter((s: any) => s.status === 'COMPLETED').length
    const total = workflow.steps.length
    const percentage = Math.round((completed / total) * 100)
    return { completed, total, percentage }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors"
          >
            New Document
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-indigo-100 text-sm font-medium">Total Documents</p>
                <p className="text-3xl font-bold mt-1">{stats.total}</p>
              </div>
              <div className="p-3 bg-white/20 rounded-lg">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium">In Review</p>
                <p className="text-3xl font-bold mt-1">{stats.inReview}</p>
              </div>
              <div className="p-3 bg-white/20 rounded-lg">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm font-medium">Approved</p>
                <p className="text-3xl font-bold mt-1">{stats.approved}</p>
              </div>
              <div className="p-3 bg-white/20 rounded-lg">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm font-medium">Drafts</p>
                <p className="text-3xl font-bold mt-1">{stats.drafts}</p>
              </div>
              <div className="p-3 bg-white/20 rounded-lg">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-red-600 text-sm font-medium">Overdue</p>
                <p className="text-3xl font-bold text-red-700 mt-1">{stats.overdue}</p>
              </div>
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-600 text-sm font-medium">Due This Week</p>
                <p className="text-3xl font-bold text-orange-700 mt-1">{stats.upcoming}</p>
              </div>
              <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-yellow-600 text-sm font-medium">High Priority</p>
                <p className="text-3xl font-bold text-yellow-700 mt-1">{stats.urgent + stats.high}</p>
              </div>
              <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Documents
            </button>
            <button
              onClick={() => setFilter('my')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === 'my'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              My Documents
            </button>
            <button
              onClick={() => setFilter('DRAFT')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === 'DRAFT'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Draft
            </button>
            <button
              onClick={() => setFilter('FOR_REVIEW')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === 'FOR_REVIEW'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              For Review
            </button>
            <button
              onClick={() => setFilter('APPROVED')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === 'APPROVED'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Approved
            </button>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-gray-500">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p>Loading documents...</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg font-medium">No documents found</p>
              <p className="text-sm mt-1">Create your first document to get started!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.map((doc) => {
                const deadlineStatus = getDeadlineStatus(doc.deadline)
                const workflowProgress = getWorkflowProgress(doc)

                return (
                  <div
                    key={doc.id}
                    onClick={() => {
                      setSelectedDocumentId(doc.id)
                      setViewModalOpen(true)
                    }}
                    className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-lg hover:border-indigo-300 transition-all cursor-pointer group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors line-clamp-2">
                          {doc.title}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">{doc.type}</p>
                      </div>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(doc.currentStatus)}`}>
                        {getStatusLabel(doc.currentStatus)}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2 mb-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-md border ${getPriorityColor(doc.priority)}`}>
                        {doc.priority}
                      </span>
                      {deadlineStatus && (
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-md ${deadlineStatus.class}`}>
                          {deadlineStatus.label}
                        </span>
                      )}
                    </div>

                    {workflowProgress && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                          <span>Workflow Progress</span>
                          <span className="font-medium">{workflowProgress.completed}/{workflowProgress.total} steps</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-indigo-600 h-2 rounded-full transition-all"
                            style={{ width: `${workflowProgress.percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-sm pt-3 border-t border-gray-100">
                      <div className="flex items-center text-gray-500">
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span className="text-xs">{doc.createdBy.name}</span>
                      </div>
                      <div className="flex items-center text-gray-500">
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-xs">{format(new Date(doc.updatedAt), 'MMM dd')}</span>
                      </div>
                    </div>

                    {doc.deadline && (
                      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center text-sm">
                        <svg className={`w-4 h-4 mr-2 ${deadlineStatus?.class?.split(' ')[0]}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className={deadlineStatus?.class?.split(' ')[0]}>
                          Deadline: {format(new Date(doc.deadline), 'MMM dd, yyyy HH:mm')}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <NewDocumentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onDocumentCreated={loadDocuments}
      />

      <ViewDocumentModal
        isOpen={viewModalOpen}
        onClose={() => {
          setViewModalOpen(false)
          setSelectedDocumentId(null)
        }}
        documentId={selectedDocumentId}
      />
    </AdminLayout>
  )
}

