'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/store'
import { getStatusColor, getStatusLabel } from '@/lib/permissions'
import { format } from 'date-fns'

interface DocumentVersion {
  id: string
  versionNumber: number
  fileName: string
  fileSize: number
  mimeType: string
  createdAt: string
  createdBy: {
    id: string
    name: string
  }
}

interface WorkflowStep {
  id: string
  stepOrder: number
  department: {
    id: string
    name: string
  } | null
  role: string
  status: string
  assignedTo: {
    id: string
    name: string
  }
  completedAt: string | null
  comment: string | null
}

interface WorkflowInstance {
  id: string
  currentStep: number
  startedAt: string
  completedAt: string | null
  steps: WorkflowStep[]
}

interface DocumentData {
  id: string
  title: string
  type: string
  currentStatus: string
  priority: string
  createdAt: string
  updatedAt: string
  createdBy: {
    id: string
    name: string
    role: string
  }
  department: {
    id: string
    name: string
  } | null
  currentVersionId: string | null
  versions: DocumentVersion[]
  workflowInstances: WorkflowInstance[]
}

interface ViewDocumentModalProps {
  isOpen: boolean
  onClose: () => void
  documentId: string | null
}

export function ViewDocumentModal({ isOpen, onClose, documentId }: ViewDocumentModalProps) {
  const { token } = useAuthStore()
  const [doc, setDoc] = useState<DocumentData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleEscape)
      return () => window.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen && documentId) {
      loadDocument()
    }
  }, [isOpen, documentId])

  const loadDocument = async () => {
    if (!documentId) return

    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to load document')
      }

      const data = await response.json()
      setDoc(data.document)
    } catch (err) {
      setError('Failed to load document details')
      console.error('Failed to load document:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadCurrent = async () => {
    if (!documentId || !doc?.currentVersionId) return

    try {
      const response = await fetch(`/api/documents/${documentId}/download-current`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to download file')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      const currentVersion = doc.versions[0]
      a.download = currentVersion?.fileName || `document-${documentId}`
      window.document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      window.document.body.removeChild(a)
    } catch (err) {
      console.error('Failed to download:', err)
      alert('Failed to download file')
    }
  }

  const handleDownloadVersion = async (versionId: string, fileName: string) => {
    try {
      const response = await fetch(`/api/documents/${documentId}/download/${versionId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to download file')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error('Failed to download:', err)
      alert('Failed to download file')
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return 'bg-red-100 text-red-800'
      case 'HIGH':
        return 'bg-orange-100 text-orange-800'
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800'
      case 'LOW':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStepStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-gray-100 text-gray-700'
      case 'IN_PROGRESS':
        return 'bg-blue-100 text-blue-700'
      case 'COMPLETED':
        return 'bg-green-100 text-green-700'
      case 'SKIPPED':
        return 'bg-gray-100 text-gray-500'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 backdrop-blur-sm overflow-y-auto h-full w-full z-50"
      onClick={onClose}
    >
      <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-5xl shadow-lg rounded-lg bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Document Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-md transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-800 p-4 rounded-md text-center">
            {error}
          </div>
        ) : doc ? (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{doc.title}</h3>
                <div className="flex items-center space-x-3">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(doc.currentStatus)}`}>
                    {getStatusLabel(doc.currentStatus)}
                  </span>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColor(doc.priority)}`}>
                    {doc.priority}
                  </span>
                  <span className="text-sm text-gray-500">{doc.type}</span>
                </div>
              </div>
              {doc.currentVersionId && (
                <button
                  onClick={handleDownloadCurrent}
                  className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Current Version
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-500 mb-2">Created By</h4>
                <p className="text-sm font-medium text-gray-900">{doc.createdBy.name}</p>
                <p className="text-xs text-gray-500 capitalize">{doc.createdBy.role.toLowerCase()}</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-500 mb-2">Department</h4>
                <p className="text-sm font-medium text-gray-900">
                  {doc.department?.name || 'All Departments'}
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-500 mb-2">Timeline</h4>
                <p className="text-sm text-gray-700">
                  Created: {format(new Date(doc.createdAt), 'MMM dd, yyyy')}
                </p>
                <p className="text-sm text-gray-700">
                  Updated: {format(new Date(doc.updatedAt), 'MMM dd, yyyy')}
                </p>
              </div>
            </div>

            {doc.workflowInstances.length > 0 && (
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Workflow Timeline</h4>
                <div className="bg-gray-50 rounded-lg p-4">
                  {doc.workflowInstances[0].steps.map((step: WorkflowStep) => (
                    <div key={step.id} className="flex items-start space-x-4 py-3 border-b border-gray-200 last:border-0">
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${getStepStatusColor(step.status)}`}>
                        {step.stepOrder}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <p className="text-sm font-medium text-gray-900">
                            {step.department?.name || 'General'} - {step.role.toLowerCase()}
                          </p>
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${getStepStatusColor(step.status)}`}>
                            {step.status.replace('_', ' ').toLowerCase()}
                          </span>
                        </div>
                        <div className="flex items-center space-x-4 mt-1">
                          <p className="text-sm text-gray-600">
                            Assigned to: {step.assignedTo.name}
                          </p>
                          {step.completedAt && (
                            <p className="text-sm text-gray-600">
                              Completed: {format(new Date(step.completedAt), 'MMM dd, yyyy HH:mm')}
                            </p>
                          )}
                        </div>
                        {step.comment && (
                          <p className="text-sm text-gray-600 mt-1 italic">"{step.comment}"</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h4 className="text-lg font-semibold text-gray-900 mb-4">Version History</h4>
              <div className="bg-gray-50 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Version
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        File Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Size
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created By
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {doc.versions.map((version: DocumentVersion) => (
                      <tr key={version.id} className={version.id === doc.currentVersionId ? 'bg-indigo-50' : ''}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-md ${
                            version.id === doc.currentVersionId
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            {version.versionNumber}
                            {version.id === doc.currentVersionId && (
                              <span className="ml-1 text-indigo-600">(Current)</span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {version.fileName}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {formatFileSize(version.fileSize)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {version.createdBy.name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {format(new Date(version.createdAt), 'MMM dd, yyyy')}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => handleDownloadVersion(version.id, version.fileName)}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            Download
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
