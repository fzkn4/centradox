'use client'

import { useEffect, useState, use, useCallback } from 'react'
import { useAuthStore, useDocumentStore } from '@/lib/store'
import { getStatusColor, getStatusLabel } from '@/lib/permissions'
import { format } from 'date-fns'
import { Layout } from '@/components/layout/Layout'
import Link from 'next/link'

interface DocumentVersion {
  id: string
  versionNumber: number
  fileName: string
  fileSize: number
  mimeType: string
  filePath: string
  createdAt: string
  createdBy: {
    id: string
    name: string
    email: string
  }
}

export default function DocumentViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user, isAuthenticated, token } = useAuthStore()
  const { currentDocument, setCurrentDocument, setLoading } = useDocumentStore()
  const [comment, setComment] = useState('')
  const [loading, setLoadingLocal] = useState(false)
  const [error, setError] = useState('')
  const [comments, setComments] = useState<any[]>([])
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)

  const loadDocument = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/documents/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setCurrentDocument(data.document)
      }
    } catch (error) {
      console.error('Failed to load document:', error)
    } finally {
      setLoading(false)
    }
  }, [id, token, setLoading, setCurrentDocument])

  const loadComments = useCallback(async () => {
    try {
      const response = await fetch(`/api/documents/${id}/comments`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setComments(data.comments)
      }
    } catch (error) {
      console.error('Failed to load comments:', error)
    }
  }, [id, token])

  useEffect(() => {
    if (!isAuthenticated) {
      window.location.href = '/login'
      return
    }
    loadDocument()
    loadComments()
  }, [isAuthenticated, loadDocument, loadComments])

  const handleDownload = async (version: DocumentVersion) => {
    try {
      const response = await fetch(`/api/documents/${version.id}/download`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = version.fileName
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      console.error('Failed to download file:', error)
      alert('Failed to download file')
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

  const handleUploadVersion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile) {
      setError('Please select a file')
      return
    }

    const formData = new FormData()
    formData.append('file', uploadFile)

    setLoadingLocal(true)
    setError('')

    try {
      const response = await fetch(`/api/documents/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      if (response.ok) {
        const data = await response.json()
        setCurrentDocument(data.document)
        setUploadFile(null)
        alert('New version uploaded successfully!')
      } else {
        const data = await response.json()
        throw new Error(data.error || 'Failed to upload version')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingLocal(false)
    }
  }

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim()) return

    try {
      const response = await fetch(`/api/documents/${id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ text: comment })
      })

      if (response.ok) {
        const data = await response.json()
        setComments([data.comment, ...comments])
        setComment('')
      }
    } catch (error) {
      console.error('Failed to add comment:', error)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const getFileIcon = (fileName: string, className: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') {
      return (
        <svg className={className} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2v4a2 2 0 012 2V4zm2 6a2 2 0 012-2v4a2 2 0 01-2 2v-4zM8 4a2 2 0 012-2v4a2 2 0 01-2 2V4zm2 6a2 2 0 012-2v4a2 2 0 01-2 2v-4z" clipRule="evenodd" />
        </svg>
      )
    }
    if (ext === 'doc' || ext === 'docx') {
      return (
        <svg className={className} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2h2zm-2 6a2 2 0 012-2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4a2 2 0 012-2h2zm8-6a2 2 0 012-2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V4a2 2 0 012-2h2zm-2 6a2 2 0 012-2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4a2 2 0 012-2h2z" clipRule="evenodd" />
        </svg>
      )
    }
    if (ext === 'xls' || ext === 'xlsx') {
      return (
        <svg className={className} fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 11a1 1 0 011-1v2a1 1 0 11-2 0v-2a1 1 0 011-1zm5-4a1 1 0 011-1v2a1 1 0 11-2 0V7a1 1 0 011-1zM5 9a1 1 0 011-1v2a1 1 0 11-2 0V9a1 1 0 011-1zm6 3a1 1 0 011-1v1a1 1 0 11-2 0v-1a1 1 0 011-1zm-2 5a1 1 0 011-1v2a1 1 0 11-2 0v-2a1 1 0 011-1zm3 2a1 1 0 011-1v2a1 1 0 11-2 0v-2a1 1 0 011-1zm-5 5a1 1 0 011-1v2a1 1 0 11-2 0v-2a1 1 0 011-1z" />
        </svg>
      )
    }
    return (
      <svg className={className} fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2h2zm-2 6a2 2 0 012-2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4a2 2 0 012-2h2zm8-6a2 2 0 012-2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V4a2 2 0 012-2h2zm-2 6a2 2 0 012-2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4a2 2 0 012-2h2z" clipRule="evenodd" />
      </svg>
    )
  }

  if (!isAuthenticated || !currentDocument) {
    return (
      <Layout>
        <div className="text-center py-8">Loading...</div>
      </Layout>
    )
  }

  const currentVersion = currentDocument.versions?.find(v => v.id === currentDocument.currentVersionId)
  const isAuthor = currentDocument.createdBy.id === user?.id
  const isReviewer = user?.role === 'REVIEWER' || user?.role === 'APPROVER' || user?.role === 'ADMIN'
  const workflowInstance = currentDocument.workflowInstances?.[0]
  const currentStep = workflowInstance?.steps?.find((step: any) => step.stepOrder === workflowInstance.currentStep)
  const isAssignedToStep = currentStep?.assignedToId === user?.id

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <Link
              href="/dashboard"
              className="text-gray-600 hover:text-gray-900 mb-2 inline-block"
            >
              ← Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">{currentDocument.title}</h1>
            <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
              <span>Type: {currentDocument.type}</span>
              <span>•</span>
              <span>Author: {currentDocument.createdBy.name}</span>
              <span>•</span>
              <span>Created: {format(new Date(currentDocument.createdAt), 'MMM dd, yyyy')}</span>
            </div>
          </div>
          <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(currentDocument.currentStatus)}`}>
            {getStatusLabel(currentDocument.currentStatus)}
          </span>
        </div>

        {error && (
          <div className="bg-red-50 text-red-800 p-4 rounded-md">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Current File</h2>
              {currentVersion ? (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                  <div className="flex items-center space-x-4">
                    <div className={`w-16 h-16 text-indigo-500`}>
                      {getFileIcon(currentVersion.fileName, 'w-full h-full')}
                    </div>
                    <div className="flex-1">
                      <p className="text-lg font-semibold text-gray-900">{currentVersion.fileName}</p>
                      <p className="text-sm text-gray-500">{formatFileSize(currentVersion.fileSize)}</p>
                      <p className="text-xs text-gray-400">
                        Uploaded by {currentVersion.createdBy.name} • {format(new Date(currentVersion.createdAt), 'MMM dd, yyyy')}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDownload(currentVersion)}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all flex items-center space-x-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>Download</span>
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No file uploaded</p>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Comments</h2>
              <form onSubmit={handleAddComment} className="mb-6">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="submit"
                    className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
                  >
                    Add Comment
                  </button>
                </div>
              </form>

              <div className="space-y-4">
                {comments.map((comment) => (
                  <div key={comment.id} className="border-b border-gray-100 pb-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-medium text-gray-900">{comment.author.name}</span>
                        <span className="text-sm text-gray-500 ml-2">
                          {format(new Date(comment.createdAt), 'MMM dd, yyyy HH:mm')}
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 text-gray-700">{comment.text}</p>
                  </div>
                ))}
                {comments.length === 0 && (
                  <p className="text-gray-500 text-center py-4">No comments yet</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Upload New Version</h2>
              {(currentDocument.currentStatus === 'DRAFT' || currentDocument.currentStatus === 'CHANGES_REQUESTED') && isAuthor && (
                <form onSubmit={handleUploadVersion}>
                  <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-all mb-4 ${
                      dragActive
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-300 hover:border-indigo-400'
                    }`}
                  >
                    <input
                      type="file"
                      id="uploadFile"
                      onChange={handleFileChange}
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.rtf"
                    />
                    <label htmlFor="uploadFile" className="cursor-pointer block">
                      {uploadFile ? (
                        <div className="flex items-center justify-center space-x-2">
                          <div className={`w-12 h-12 text-indigo-500`}>
                            {getFileIcon(uploadFile.name, 'w-full h-full')}
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-medium text-gray-900">{uploadFile.name}</p>
                            <p className="text-xs text-gray-500">{formatFileSize(uploadFile.size)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              setUploadFile(null)
                            }}
                            className="ml-2 px-2 py-1 text-xs text-red-600 hover:text-red-800 border border-red-300 rounded hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div>
                          <svg className="w-12 h-12 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <p className="text-sm text-gray-600 mb-1">
                            Drag and drop your file here
                          </p>
                          <p className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                            or browse to choose
                          </p>
                        </div>
                      )}
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !uploadFile}
                    className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
                  >
                    {loading ? 'Uploading...' : 'Upload New Version'}
                  </button>
                </form>
              )}
              {!((currentDocument.currentStatus === 'DRAFT' || currentDocument.currentStatus === 'CHANGES_REQUESTED') && isAuthor) && (
                <p className="text-sm text-gray-500 text-center py-4">
                  Only document author can upload new versions when in DRAFT or CHANGES_REQUESTED status
                </p>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Actions</h2>

              {currentDocument.currentStatus === 'DRAFT' && isAuthor && (
                <button
                  onClick={() => {
                    fetch(`/api/documents/${id}/workflow`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                      },
                      body: JSON.stringify({ action: 'submit' })
                    }).then(res => res.json()).then(data => {
                      setCurrentDocument(data.document)
                      alert('Document submitted for review!')
                    }).catch(() => alert('Failed to submit'))
                  }}
                  className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 mb-3"
                >
                  Submit for Review
                </button>
              )}

              {currentDocument.currentStatus === 'FOR_REVIEW' && isReviewer && isAssignedToStep && (
                <>
                  <button
                    onClick={() => {
                      fetch(`/api/documents/${id}/workflow`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ action: 'approve' })
                      }).then(res => res.json()).then(data => {
                        setCurrentDocument(data.document)
                        alert('Document approved!')
                      }).catch(() => alert('Failed to approve'))
                    }}
                    className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 mb-3"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      const comment = prompt('Enter reason for requesting changes:')
                      if (comment) {
                        fetch(`/api/documents/${id}/workflow`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                          },
                          body: JSON.stringify({ action: 'request-changes', comment })
                        }).then(res => res.json()).then(data => {
                          setCurrentDocument(data.document)
                          alert('Changes requested!')
                        }).catch(() => alert('Failed to request changes'))
                      }
                    }}
                    className="w-full bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700"
                  >
                    Request Changes
                  </button>
                </>
              )}
            </div>

            {workflowInstance && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Workflow Progress</h2>
                <div className="space-y-4">
                  {workflowInstance.steps?.map((step: any, index: number) => (
                    <div
                      key={step.id}
                      className={`flex items-start ${index + 1 === workflowInstance.currentStep ? 'bg-indigo-50 p-3 rounded' : ''}`}
                    >
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                        step.status === 'COMPLETED'
                          ? 'bg-green-500 text-white'
                          : index + 1 === workflowInstance.currentStep
                          ? 'bg-indigo-500 text-white'
                          : 'bg-gray-200 text-gray-600'
                      }`}>
                        {step.status === 'COMPLETED' ? '✓' : index + 1}
                      </div>
                      <div className="ml-3 flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          {step.role}
                          {step.department && ` (${step.department})`}
                        </div>
                        <div className="text-sm text-gray-500">
                          Assigned to: {step.assignedTo.name}
                        </div>
                        {step.comment && (
                          <div className="text-sm text-gray-700 mt-1 italic">{step.comment}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Versions</h2>
              <div className="space-y-2">
                {currentDocument.versions?.map((version: DocumentVersion) => (
                  <div
                    key={version.id}
                    className={`flex justify-between items-center p-3 rounded border ${
                      version.id === currentDocument.currentVersionId
                        ? 'bg-indigo-50 border-indigo-300'
                        : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center space-x-3 flex-1">
                      <div className={`w-8 h-8 text-gray-500`}>
                        {getFileIcon(version.fileName, 'w-full h-full')}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Version {version.versionNumber}</p>
                        <p className="text-xs text-gray-500">{format(new Date(version.createdAt), 'MMM dd, yyyy')}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownload(version)}
                      className="px-3 py-1 text-sm text-indigo-600 hover:text-indigo-800 border border-indigo-300 rounded hover:bg-indigo-50"
                    >
                      Download
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
