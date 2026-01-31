'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@/lib/store'
import { getStatusColor, getStatusLabel } from '@/lib/permissions'
import { format } from 'date-fns'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { ViewDocumentModal } from '@/components/modals/ViewDocumentModal'
import { WorkflowTimelineVertical } from '@/components/workflow/WorkflowTimeline'

interface WorkflowStep {
  id: string
  stepOrder: number
  departmentId: string | null
  role: string
  status: string
  completedAt: string | null
  comment: string | null
  department: {
    id: string
    name: string
  } | null
  assignedTo: {
    id: string
    name: string
  } | null
}

interface Document {
  id: string
  title: string
  type: string
  currentStatus: string
  currentVersionId: string | null
  createdAt: string
  updatedAt: string
  priority: string
  createdBy: {
    id: string
    username: string
    name: string
    role: string
  }
  department: {
    id: string
    name: string
  } | null
  workflowInstances: Array<{
    id: string
    currentStep: number
    startedAt: string
    completedAt: string | null
    steps: WorkflowStep[]
  }>
  canInteract: boolean
  userDepartmentStep: {
    stepOrder: number
    departmentName: string
    requiredRole: string
    stepStatus: string
    isCurrentStep: boolean
  } | null
}

export default function MyDocumentsPage() {
  const { user, isAuthenticated, token, isHydrated } = useAuthStore()
  const [documents, setDocuments] = useState<Document[]>([])
  const [allDocuments, setAllDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [expandedDocument, setExpandedDocument] = useState<string | null>(null)

  const loadDocuments = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/my-documents', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setDocuments(data.documents)
        setAllDocuments(data.allDocuments)
      }
    } catch (error) {
      console.error('Failed to load documents:', error)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      window.location.href = '/login'
      return
    }
    if (isHydrated && isAuthenticated) {
      loadDocuments()
    }
  }, [isAuthenticated, isHydrated, loadDocuments])

  const isDrafter = user?.role === 'DRAFTER'
  const displayedDocuments = isDrafter ? allDocuments : (filter === 'pending' ? documents : allDocuments)

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      RESTRICTED: 'bg-blue-100 text-blue-800',
      CONFIDENTIAL: 'bg-green-100 text-green-800',
      SECRET: 'bg-orange-100 text-orange-800',
      TOP_SECRET: 'bg-red-100 text-red-800'
    }
    return colors[priority] || 'bg-gray-100 text-gray-800'
  }

  const getPriorityLabel = (priority: string) => {
    const labels: Record<string, string> = {
      RESTRICTED: 'Restricted',
      CONFIDENTIAL: 'Confidential',
      SECRET: 'Secret',
      TOP_SECRET: 'Top Secret'
    }
    return labels[priority] || priority
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {isDrafter ? 'Documents' : 'My Documents'}
            </h1>
            <p className="mt-2 text-gray-600">
              {isDrafter
                ? 'Documents you have created'
                : 'Documents requiring your attention'
              }
            </p>
          </div>
          {!isDrafter && (
            <div className="flex space-x-2">
              <button
                onClick={() => setFilter('pending')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filter === 'pending'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Pending ({documents.length})
              </button>
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filter === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                All Documents ({allDocuments.length})
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center text-gray-500">
            Loading documents...
          </div>
        ) : displayedDocuments.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900">No documents found</h3>
            <p className="mt-2 text-gray-500">
              {isDrafter
                ? 'You haven\'t created any documents yet.'
                : filter === 'pending'
                ? 'You have no pending documents requiring your attention.'
                : 'No documents are assigned to your departments yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayedDocuments.map((doc) => {
              const workflowInstance = doc.workflowInstances[0]
              const isExpanded = expandedDocument === doc.id

              return (
                <div
                  key={doc.id}
                  className={`bg-white rounded-lg shadow-sm overflow-hidden transition-all ${
                    isExpanded ? 'ring-2 ring-indigo-500 ring-offset-2' : ''
                  } ${doc.canInteract ? 'border-l-4 border-l-indigo-500' : ''}`}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-xl font-semibold text-gray-900">
                            {doc.title}
                          </h3>
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColor(doc.priority)}`}>
                            {getPriorityLabel(doc.priority)}
                          </span>
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(doc.currentStatus)}`}>
                            {getStatusLabel(doc.currentStatus)}
                          </span>
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                          <span>{doc.type}</span>
                          <span>•</span>
                          <span>Author: {doc.createdBy.name}</span>
                          <span>•</span>
                          <span>Updated: {format(new Date(doc.updatedAt), 'MMM dd, yyyy')}</span>
                        </div>
                         {doc.userDepartmentStep && !isDrafter && (
                          <div className="mt-3">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-50 text-indigo-700">
                              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                              </svg>
                              Your Department: {doc.userDepartmentStep.departmentName} -{' '}
                              <span className="capitalize">{doc.userDepartmentStep.requiredRole.toLowerCase()}</span>
                              {doc.canInteract && (
                                <span className="ml-2 px-2 py-0.5 bg-indigo-200 text-indigo-900 rounded-full text-xs font-bold">
                                  ACTION REQUIRED
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        <button
                          onClick={() => {
                            setSelectedDocumentId(doc.id)
                            setViewModalOpen(true)
                          }}
                          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-all"
                        >
                          View Document
                        </button>
                        <button
                          onClick={() => setExpandedDocument(isExpanded ? null : doc.id)}
                          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
                          title={isExpanded ? 'Hide timeline' : 'Show timeline'}
                        >
                          <svg
                            className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {isExpanded && workflowInstance && (
                      <div className="mt-6 pt-6 border-t border-gray-200">
                        <h4 className="text-sm font-semibold text-gray-900 mb-4">Workflow Timeline</h4>
                        <WorkflowTimelineVertical
                          steps={workflowInstance.steps}
                          currentStep={workflowInstance.currentStep}
                          userDepartmentStep={doc.userDepartmentStep}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

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
