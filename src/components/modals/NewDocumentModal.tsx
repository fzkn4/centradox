'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '@/lib/store'

interface Department {
  id: string
  name: string
}

interface TimelineStep {
  id: string
  stepOrder: number
  departmentId: string | null
  departmentName: string
  role: 'ADMIN' | 'EDITOR' | 'APPROVER'
}

interface NewDocumentModalProps {
  isOpen: boolean
  onClose: () => void
  onDocumentCreated: () => void
}

export function NewDocumentModal({ isOpen, onClose, onDocumentCreated }: NewDocumentModalProps) {
  const { token } = useAuthStore()
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState({
    title: '',
    type: 'Proposal',
    departmentId: '',
    priority: 'MEDIUM'
  })
  const [departments, setDepartments] = useState<Department[]>([])
  const [timelineSteps, setTimelineSteps] = useState<TimelineStep[]>([])
  const [stepToAdd, setStepToAdd] = useState({
    departmentId: '',
    role: 'APPROVER' as const
  })
  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingDepartments, setLoadingDepartments] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen && titleInputRef.current) {
      titleInputRef.current.focus()
      loadDepartments()
    }
  }, [isOpen])

  const loadDepartments = async () => {
    setLoadingDepartments(true)
    try {
      const response = await fetch('/api/departments', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        setDepartments(data.departments)
      }
    } catch (error) {
      console.error('Failed to load departments:', error)
    } finally {
      setLoadingDepartments(false)
    }
  }

  useEffect(() => {
    if (isOpen && titleInputRef.current) {
      titleInputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

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
      const droppedFile = e.dataTransfer.files[0]
      setFile(droppedFile)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim() || !file) {
      setError('Title and file are required')
      return
    }

    const formDataToSend = new FormData()
    formDataToSend.append('title', formData.title)
    formDataToSend.append('type', formData.type)
    formDataToSend.append('file', file)
    formDataToSend.append('departmentId', formData.departmentId)
    formDataToSend.append('priority', formData.priority)
    formDataToSend.append('timelineSteps', JSON.stringify(timelineSteps.map(step => ({
      departmentId: step.departmentId,
      role: step.role
    }))))

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formDataToSend
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create document')
      }

      onDocumentCreated()
      onClose()
      // Reset form
      setFormData({ title: '', type: 'Proposal', departmentId: '', priority: 'MEDIUM' })
      setTimelineSteps([])
      setStepToAdd({ departmentId: '', role: 'APPROVER' })
      setFile(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const addTimelineStep = () => {
    if (!stepToAdd.departmentId) {
      setError('Please select a department for the review step')
      return
    }

    const department = departments.find(d => d.id === stepToAdd.departmentId)
    if (!department) return

    const newStep: TimelineStep = {
      id: Date.now().toString(),
      stepOrder: timelineSteps.length + 1,
      departmentId: stepToAdd.departmentId,
      departmentName: department.name,
      role: stepToAdd.role
    }

    setTimelineSteps([...timelineSteps, newStep])
    setStepToAdd({ departmentId: '', role: 'APPROVER' })
    setError('')
  }

  const removeTimelineStep = (stepId: string) => {
    setTimelineSteps(timelineSteps.filter(step => step.id !== stepId))
    setTimelineSteps(prev => prev.map((step, index) => ({
      ...step,
      stepOrder: index + 1
    })))
  }

  const moveTimelineStep = (index: number, direction: 'up' | 'down') => {
    const newSteps = [...timelineSteps]
    const targetIndex = direction === 'up' ? index - 1 : index + 1

    if (targetIndex < 0 || targetIndex >= newSteps.length) return

    const temp = newSteps[index]
    newSteps[index] = newSteps[targetIndex]
    newSteps[targetIndex] = temp

    setTimelineSteps(newSteps.map((step, idx) => ({
      ...step,
      stepOrder: idx + 1
    })))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const getFileIcon = () => {
    if (!file) return null
    const ext = file.name.split('.').pop()?.toLowerCase()
    const iconClass = 'w-16 h-16'

    if (ext === 'pdf') {
      return (
        <svg className={`${iconClass} text-red-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0016.586V3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      )
    }
    if (ext === 'doc' || ext === 'docx') {
      return (
        <svg className={`${iconClass} text-blue-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    }
    if (ext === 'xls' || ext === 'xlsx') {
      return (
        <svg className={`${iconClass} text-green-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    }
    return (
      <svg className={`${iconClass} text-gray-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0016.586V3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    )
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 backdrop-blur-sm overflow-y-auto h-full w-full z-50"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onClose()
        }
      }}
      tabIndex={-1}
    >
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="mt-3">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">New Document</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

           {error && (
             <div id="error-message" className="bg-red-50 text-red-800 p-4 rounded-md mb-4">
               {error}
             </div>
           )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                  Document Title
                </label>
                  <input
                    ref={titleInputRef}
                    id="title"
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                    placeholder="Enter document title"
                    aria-describedby={error ? "error-message" : undefined}
                  />
              </div>

              <div>
                <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                  Document Type
                </label>
                  <select
                    id="type"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                  >
                   <option value="Proposal">Proposal</option>
                   <option value="Report">Report</option>
                   <option value="Contract">Contract</option>
                   <option value="Memo">Memo</option>
                   <option value="Policy">Policy</option>
                   <option value="Other">Other</option>
                 </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="department" className="block text-sm font-medium text-gray-700 mb-1">
                  Department <span className="text-gray-400 text-xs">(Optional - limits visibility)</span>
                </label>
                <select
                  id="department"
                  value={formData.departmentId}
                  onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                  disabled={loadingDepartments}
                >
                  <option value="">All Departments</option>
                  {loadingDepartments ? (
                    <option disabled>Loading...</option>
                  ) : (
                    departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <select
                  id="priority"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-gray-900">Review Timeline</h4>
                <span className="text-xs text-gray-500">Configure approval steps in order</span>
              </div>

              {timelineSteps.length > 0 && (
                <div className="space-y-2 mb-4">
                  {timelineSteps.map((step, index) => (
                    <div
                      key={step.id}
                      className="flex items-center justify-between bg-gray-50 p-3 rounded-md"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="flex items-center justify-center w-6 h-6 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-full">
                          {step.stepOrder}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{step.departmentName}</p>
                          <p className="text-xs text-gray-500 capitalize">{step.role.toLowerCase()}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => moveTimelineStep(index, 'up')}
                          disabled={index === 0}
                          className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
                          title="Move up"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveTimelineStep(index, 'down')}
                          disabled={index === timelineSteps.length - 1}
                          className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
                          title="Move down"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeTimelineStep(step.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Remove step"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  value={stepToAdd.departmentId}
                  onChange={(e) => setStepToAdd({ ...stepToAdd, departmentId: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-gray-900"
                  disabled={loadingDepartments}
                >
                  <option value="">Select department to add...</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
                <select
                  value={stepToAdd.role}
                  onChange={(e) => setStepToAdd({ ...stepToAdd, role: e.target.value as any })}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-gray-900"
                >
                  <option value="APPROVER">Approver</option>
                  <option value="EDITOR">Editor</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <button
                type="button"
                onClick={addTimelineStep}
                disabled={!stepToAdd.departmentId}
                className="mt-2 w-full px-3 py-2 border border-indigo-300 text-indigo-700 rounded-md hover:bg-indigo-50 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                + Add Review Step
              </button>
              {timelineSteps.length === 0 && (
                <p className="text-xs text-gray-500 text-center mt-2">
                  No review steps configured. Document will be created without a workflow.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Upload File
              </label>
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-all ${
                  dragActive
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-300 hover:border-indigo-400'
                }`}
              >
                <input
                  type="file"
                  id="file"
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.rtf"
                />
                <label
                  htmlFor="file"
                  className="cursor-pointer block"
                >
                  {file ? (
                    <div className="flex items-center justify-center space-x-4">
                      {getFileIcon()}
                      <div className="text-left">
                        <p className="text-sm font-semibold text-gray-900">{file.name}</p>
                        <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          setFile(null)
                        }}
                        className="ml-4 px-3 py-1 text-sm text-red-600 hover:text-red-800 border border-red-300 rounded hover:bg-red-50"
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
                        Drag and drop your file here, or
                      </p>
                      <p className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
                        browse to choose a file
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Supported formats: PDF, DOC, DOCX, XLS, XLSX, TXT, RTF
                      </p>
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !file}
                className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating...
                  </span>
                ) : (
                  'Create Document'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}