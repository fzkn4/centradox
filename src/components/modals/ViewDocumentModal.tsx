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
  const { token, user } = useAuthStore()
  const [doc, setDoc] = useState<DocumentData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'details' | 'workflow' | 'versions' | 'complete'>('details')

  const [completeComment, setCompleteComment] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

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
      setActiveTab('details')
      setCompleteComment('')
      setUploadFile(null)
      setSubmitError('')
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

  const handleCompleteStep = async () => {
    setSubmitError('')

    if (!completeComment.trim()) {
      setSubmitError('Please add a comment')
      return
    }

    if (user?.role === 'EDITOR' && !uploadFile) {
      setSubmitError('Please upload a file')
      return
    }

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('action', 'complete-step')
      formData.append('comment', completeComment)
      if (uploadFile) {
        formData.append('file', uploadFile)
      }

      const response = await fetch(`/api/documents/${documentId}/complete-step`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to complete step')
      }

      await loadDocument()
      setActiveTab('workflow')
      setCompleteComment('')
      setUploadFile(null)
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to complete step')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setUploadFile(e.dataTransfer.files[0])
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFile(e.target.files[0])
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

  const canCompleteStep = doc?.workflowInstances?.[0]?.steps.find(
    (step: any) => step.stepOrder === doc.workflowInstances[0].currentStep
  )?.assignedTo?.id === user?.id || user?.role === 'ADMIN'

  const isCurrentStepEditor = doc?.workflowInstances?.[0]?.steps.find(
    (step: any) => step.stepOrder === doc.workflowInstances[0].currentStep
  )?.role === 'EDITOR'

  const isDocumentComplete = doc?.currentStatus === 'APPROVED' || doc?.currentStatus === 'FINAL'

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 backdrop-blur-sm overflow-y-auto h-full w-full z-50"
      onClick={onClose}
    >
      <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-5xl shadow-xl rounded-xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Document Details</h2>
            {doc && (
              <p className="text-sm text-gray-500 mt-1">{doc.title}</p>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {canCompleteStep && !isDocumentComplete && (
              <button
                onClick={() => setActiveTab('complete')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeTab === 'complete'
                    ? 'bg-green-600 text-white'
                    : 'bg-green-50 text-green-700 hover:bg-green-100'
                }`}
              >
                Complete Step
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-md transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
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
            <div className="border-b border-gray-200">
              <nav className="flex space-x-8 -mb-px">
                <button
                  onClick={() => setActiveTab('details')}
                  className={`py-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'details'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Details
                </button>
                <button
                  onClick={() => setActiveTab('workflow')}
                  className={`py-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'workflow'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Workflow Timeline
                </button>
                <button
                  onClick={() => setActiveTab('versions')}
                  className={`py-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'versions'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Version History ({doc.versions.length})
                </button>
              </nav>
            </div>

            {activeTab === 'details' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="bg-indigo-50 rounded-lg p-4">
                    <h4 className="text-xs font-medium text-indigo-600 uppercase tracking-wider mb-1">Status</h4>
                    <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(doc.currentStatus)}`}>
                      {getStatusLabel(doc.currentStatus)}
                    </span>
                  </div>
                  <div className="bg-indigo-50 rounded-lg p-4">
                    <h4 className="text-xs font-medium text-indigo-600 uppercase tracking-wider mb-1">Priority</h4>
                    <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getPriorityColor(doc.priority)}`}>
                      {doc.priority}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Type</h4>
                    <p className="text-sm font-medium text-gray-900">{doc.type}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Current Version</h4>
                    <p className="text-sm font-medium text-gray-900">{doc.versions.length}</p>
                  </div>
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
                    <h4 className="text-sm font-medium text-gray-500 mb-2">Last Updated</h4>
                    <p className="text-sm text-gray-700">
                      {format(new Date(doc.updatedAt), 'MMM dd, yyyy HH:mm')}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  {doc.currentVersionId && (
                    <button
                      onClick={handleDownloadCurrent}
                      className="inline-flex items-center px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-medium"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download Current Version
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'workflow' && doc.workflowInstances.length > 0 && (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  {doc.workflowInstances[0].steps.map((step: WorkflowStep) => (
                    <div key={step.id} className={`flex items-start space-x-4 py-4 ${step.stepOrder < doc.workflowInstances[0].currentStep ? 'opacity-60' : ''}`}>
                      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${getStepStatusColor(step.status)} ${step.stepOrder === doc.workflowInstances[0].currentStep ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}>
                        {step.stepOrder}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <p className="text-sm font-semibold text-gray-900">
                            {step.department?.name || 'General'} - {step.role.toLowerCase()}
                          </p>
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${getStepStatusColor(step.status)}`}>
                            {step.status.replace('_', ' ').toLowerCase()}
                          </span>
                          {step.stepOrder === doc.workflowInstances[0].currentStep && (
                            <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600">
                          <p>Assigned to: {step.assignedTo.name}</p>
                          {step.completedAt && (
                            <p>Completed: {format(new Date(step.completedAt), 'MMM dd, yyyy HH:mm')}</p>
                          )}
                        </div>
                        {step.comment && (
                          <p className="text-sm text-gray-700 mt-2 bg-white p-3 rounded-lg italic border border-gray-200">
                            "{step.comment}"
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'versions' && (
              <div className="bg-gray-50 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Version
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        File Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Size
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created By
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {doc.versions.map((version: DocumentVersion) => (
                      <tr key={version.id} className={version.id === doc.currentVersionId ? 'bg-indigo-50' : ''}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-md ${
                            version.id === doc.currentVersionId
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            {version.versionNumber}
                            {version.id === doc.currentVersionId && (
                              <span className="ml-2 text-indigo-600">(Current)</span>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {version.fileName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatFileSize(version.fileSize)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {version.createdBy.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {format(new Date(version.createdAt), 'MMM dd, yyyy')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => handleDownloadVersion(version.id, version.fileName)}
                            className="text-indigo-600 hover:text-indigo-900 font-medium"
                          >
                            Download
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'complete' && canCompleteStep && !isDocumentComplete && (
              <div className="space-y-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <svg className="w-6 h-6 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <h4 className="text-sm font-semibold text-green-800">Complete this step</h4>
                      <p className="text-sm text-green-700 mt-1">
                        {isCurrentStepEditor
                          ? 'As an editor, you must upload a new file version and add a comment to complete this step.'
                          : 'Add a comment to complete this step and pass it to the next department.'}
                      </p>
                    </div>
                  </div>
                </div>

                {isCurrentStepEditor && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Upload New Version <span className="text-red-500">*</span>
                    </label>
                    <div
                      className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg transition-all ${
                        dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400'
                      } ${uploadFile ? 'border-green-500 bg-green-50' : ''}`}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                    >
                      <div className="space-y-1 text-center">
                        {uploadFile ? (
                          <div className="flex items-center justify-center space-x-3">
                            <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div className="text-left">
                              <p className="text-sm font-medium text-gray-900">{uploadFile.name}</p>
                              <p className="text-xs text-gray-500">{formatFileSize(uploadFile.size)}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setUploadFile(null)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <>
                            <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <div className="flex text-sm text-gray-600">
                              <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none">
                                <span>Upload a file</span>
                                <input id="file-upload" type="file" className="sr-only" onChange={handleFileChange} />
                              </label>
                              <p className="pl-1">or drag and drop</p>
                            </div>
                            <p className="text-xs text-gray-500">PDF, DOC, DOCX, XLS, XLSX up to 10MB</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Comment <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={completeComment}
                    onChange={(e) => setCompleteComment(e.target.value)}
                    rows={4}
                    className="shadow-sm block w-full focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border border-gray-300 rounded-md"
                    placeholder="Add your comments, feedback, or approval notes..."
                  />
                </div>

                {submitError && (
                  <div className="bg-red-50 text-red-800 p-3 rounded-md text-sm">
                    {submitError}
                  </div>
                )}

                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <button
                    onClick={() => setActiveTab('details')}
                    className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-all font-medium"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCompleteStep}
                    disabled={submitting}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <span className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Completing...
                      </span>
                    ) : 'Complete Step'}
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all font-medium"
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
