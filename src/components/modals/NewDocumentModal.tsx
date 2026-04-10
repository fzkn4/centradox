'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '@/lib/store'
import { sileo } from 'sileo'

interface Department {
  id: string
  name: string
}

interface TimelineStep {
  id: string
  stepOrder: number
  departmentId: string | null
  departmentName: string
  role: 'ADMIN' | 'APPROVER' | 'DRAFTER'
}

interface SelectedDepartment {
  id: string
  name: string
}

interface NewDocumentModalProps {
  isOpen: boolean
  onClose: () => void
  onDocumentCreated: () => void
}

export function NewDocumentModal({ isOpen, onClose, onDocumentCreated }: NewDocumentModalProps) {
  const { token, user } = useAuthStore()
  const isDrafter = user?.role === 'DRAFTER'
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState({
    title: '',
    type: 'Proposal',
    departmentIds: [] as string[],
    priority: 'CONFIDENTIAL',
    complianceType: '',
    deadline: ''
  })
  const [departments, setDepartments] = useState<Department[]>([])
  const [timelineSteps, setTimelineSteps] = useState<TimelineStep[]>([])
  const [stepToAdd, setStepToAdd] = useState({
    departmentId: '',
    role: 'APPROVER' as const
  })
  const [files, setFiles] = useState<File[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [referenceFiles, setReferenceFiles] = useState<File[]>([])
  const [referenceDragActive, setReferenceDragActive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingDepartments, setLoadingDepartments] = useState(false)
  const [error, setError] = useState('')
  const [isDepartmentDropdownOpen, setIsDepartmentDropdownOpen] = useState(false)
  const [selectedDepartments, setSelectedDepartments] = useState<SelectedDepartment[]>([])

  useEffect(() => {
    if (isOpen && titleInputRef.current) {
      titleInputRef.current.focus()
      loadDepartments()
    }
  }, [isOpen])

  const handleDepartmentToggle = (dept: Department) => {
    setSelectedDepartments(prev => {
      const isSelected = prev.some(d => d.id === dept.id)
      if (isSelected) {
        return prev.filter(d => d.id !== dept.id)
      } else {
        return [...prev, { id: dept.id, name: dept.name }]
      }
    })
  }

  const handleDepartmentRemove = (deptId: string) => {
    setSelectedDepartments(prev => prev.filter(d => d.id !== deptId))
  }

  const handleDepartmentSelectAll = () => {
    setSelectedDepartments([])
  }

  useEffect(() => {
    setFormData(prev => ({ ...prev, departmentIds: selectedDepartments.map(d => d.id) }))
  }, [selectedDepartments])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isDepartmentDropdownOpen && !(event.target as Element).closest('.department-dropdown')) {
        setIsDepartmentDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isDepartmentDropdownOpen])

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

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)])
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files
    if (picked && picked.length > 0) {
      setFiles(prev => [...prev, ...Array.from(picked)])
    }
  }

  const handleFileRemove = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleReferenceDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setReferenceDragActive(true)
    } else if (e.type === 'dragleave') {
      setReferenceDragActive(false)
    }
  }

  const handleReferenceDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setReferenceDragActive(false)

    if (e.dataTransfer.files) {
      setReferenceFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)])
    }
  }

  const handleReferenceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      setReferenceFiles(prev => [...prev, ...Array.from(files)])
    }
  }

  const handleReferenceFileRemove = (index: number) => {
    setReferenceFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) {
      setError('Title is required')
      sileo.error({ title: 'Title is required' })
      return
    }

    // File validation based on role
    if (isDrafter && files.length === 0) {
      setError('Initial document upload is required for DRAFTER role')
      sileo.error({ title: 'Upload is required for DRAFTER role' })
      return
    }

    // Workflow timeline is required for all users
    if (timelineSteps.length === 0) {
      setError('Workflow timeline is required for all document creation')
      sileo.error({ title: 'Workflow timeline is required' })
      return
    }

    const formDataToSend = new FormData()
    formDataToSend.append('title', formData.title)
    formDataToSend.append('type', formData.type)
    files.forEach((f) => formDataToSend.append('files', f))
    if (referenceFiles.length > 0) {
      referenceFiles.forEach((refFile) => {
        formDataToSend.append('referenceFiles', refFile)
      })
    }
    formDataToSend.append('departmentIds', JSON.stringify(formData.departmentIds))
    formDataToSend.append('priority', formData.priority)
    if (formData.complianceType) {
      formDataToSend.append('complianceType', formData.complianceType)
    }
    if (formData.deadline) {
      formDataToSend.append('deadline', formData.deadline)
    }
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
      setFormData({ title: '', type: 'Proposal', departmentIds: [], priority: 'RESTRICTED', complianceType: '', deadline: '' })
      setTimelineSteps([])
      setStepToAdd({ departmentId: '', role: 'APPROVER' })
      setFiles([])
      setReferenceFiles([])
      setSelectedDepartments([])
      setIsDepartmentDropdownOpen(false)
      sileo.success({ title: 'Document created successfully' })
    } catch (err: any) {
      setError(err.message)
      sileo.error({ title: err.message })
    } finally {
      setLoading(false)
    }
  }

  const addTimelineStep = () => {
    if (!stepToAdd.departmentId) {
      setError('Please select a department for the review step')
      sileo.error({ title: 'Please select a department' })
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
    const firstFile = files[0]
    if (!firstFile) return null
    const ext = firstFile.name.split('.').pop()?.toLowerCase()
    const iconClass = 'w-16 h-16'

    if (ext === 'pdf') {
      return (
        <svg className={`${iconClass} text-red-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0016.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
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
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0016.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
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
                    Requested Action
                  </label>
                  <select
                    id="type"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                  >
                   <option value="Approval/Signature">Approval/Signature</option>
                   <option value="Appropriate Staff Action">Appropriate Staff Action</option>
                   <option value="Comment/Recommendation">Comment/Recommendation</option>
                   <option value="Study/Investigation">Study/Investigation</option>
                   <option value="Reply Direct to Writer">Reply Direct to Writer</option>
                   <option value="Rewrite/Repeat">Rewrite/Repeat</option>
                   <option value="Notation/Information">Notation/Information</option>
                   <option value="See Me/Call Me">See Me/Call Me</option>
                  </select>
              </div>
            </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Departments <span className="text-gray-400 text-xs">(Optional - select which departments can view this document)</span>
                  </label>
                  <div className="relative department-dropdown">
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900 bg-white cursor-pointer" onClick={() => setIsDepartmentDropdownOpen(!isDepartmentDropdownOpen)}>
                      <div className="flex flex-wrap gap-1">
                        {selectedDepartments.length > 0 ? (
                          selectedDepartments.map((dept) => (
                            <span key={dept.id} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                              {dept.name}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDepartmentRemove(dept.id)
                                }}
                                className="ml-1 inline-flex items-center p-0.5 rounded-full text-indigo-400 hover:bg-indigo-200 hover:text-indigo-500"
                              >
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-400">All Departments</span>
                        )}
                      </div>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                        <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                    {isDepartmentDropdownOpen && (
                      <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
                        <div className="px-3 py-2">
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                              checked={selectedDepartments.length === 0}
                              onChange={() => handleDepartmentSelectAll()}
                            />
                            <span className="ml-2 text-sm text-gray-700">All Departments</span>
                          </label>
                        </div>
                        {loadingDepartments ? (
                          <div className="px-3 py-2 text-sm text-gray-500">Loading...</div>
                        ) : (
                          departments.map((dept) => (
                            <div key={dept.id} className="px-3 py-2">
                              <label className="flex items-center">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                  checked={selectedDepartments.some(d => d.id === dept.id)}
                                  onChange={() => handleDepartmentToggle(dept)}
                                />
                                <span className="ml-2 text-sm text-gray-700">{dept.name}</span>
                              </label>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
               <div>
                  <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">
                    Classification
                  </label>
                  <select
                    id="priority"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                  >
                    <option value="CONFIDENTIAL">Confidential</option>
                    <option value="RESTRICTED">Restricted</option>
                    <option value="SECRET">Secret</option>
                    <option value="TOP_SECRET">Top Secret</option>
                  </select>
                </div>
 
                <div>
                  <label htmlFor="complianceType" className="block text-sm font-medium text-gray-700 mb-1">
                    Type of Compliance
                  </label>
                  <select
                    id="complianceType"
                    value={formData.complianceType}
                    onChange={(e) => setFormData({ ...formData, complianceType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                  >
                    <option value="">None</option>
                    <option value="PRIORITY_ACTION">Priority</option>
                    <option value="URGENT_RUSH">Urgent/Rush</option>
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                    <option value="PERIODIC">Periodic</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="ANNUALLY">Annually</option>
                  </select>
                </div>

               <div>
                 <label htmlFor="deadline" className="block text-sm font-medium text-gray-700 mb-1">
                   Deadline <span className="text-gray-400 text-xs">(Optional - when the document must be finished)</span>
                 </label>
                 <input
                   id="deadline"
                   type="datetime-local"
                   value={formData.deadline}
                   onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                   className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                 />
               </div>
             </div>

             <div className="border rounded-lg p-4">
               <div className="flex items-center justify-between mb-3">
                 <h4 className="text-sm font-medium text-gray-900">
                   Review Timeline (Required)
                 </h4>
                 <span className="text-xs text-gray-500">
                   Configure approval steps in order{!isDrafter ? ' - must start with DRAFTER role' : ''}
                 </span>
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
                 <p className="text-xs text-red-600 text-center mt-2 font-medium">
                   Review timeline is required for document creation
                 </p>
               )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Upload Initial Document {user?.role === 'DRAFTER' ? '(Required)' : '(Optional)'}
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
                  multiple
                  accept=".docx,.pdf,.ppt,.pptx,.xls,.xlsx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                />
                <label
                  htmlFor="file"
                  className="cursor-pointer block"
                >
                  {files.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
                        <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>{files.length} file{files.length > 1 ? 's' : ''} selected</span>
                      </div>
                      <div className="space-y-2 text-left max-h-40 overflow-y-auto">
                        {files.map((f, idx) => (
                          <div key={`${f.name}-${idx}`} className="flex items-center justify-between bg-gray-50 p-2 rounded-md">
                            <div className="flex items-center space-x-2 min-w-0">
                              {getFileIcon()}
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{f.name}</p>
                                <p className="text-xs text-gray-500">{formatFileSize(f.size)}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                handleFileRemove(idx)
                              }}
                              className="ml-2 px-2 py-1 text-xs text-red-600 hover:text-red-800 border border-red-300 rounded hover:bg-red-50 flex-shrink-0"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
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
                        Supported formats: DOCX, PDF, PPT/PPTX, XLS/XLSX
                      </p>
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Upload Reference Documents (Optional)
              </label>
              <div
                onDragEnter={handleReferenceDrag}
                onDragLeave={handleReferenceDrag}
                onDragOver={handleReferenceDrag}
                onDrop={handleReferenceDrop}
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-all ${
                  referenceDragActive
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-300 hover:border-indigo-400'
                }`}
              >
                <input
                  type="file"
                  id="referenceFiles"
                  onChange={handleReferenceFileChange}
                  className="hidden"
                  multiple
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
                />
                <label
                  htmlFor="referenceFiles"
                  className="cursor-pointer block"
                >
                  {referenceFiles.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
                        <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>{referenceFiles.length} file{referenceFiles.length > 1 ? 's' : ''} selected</span>
                      </div>
                      <div className="space-y-2 text-left max-h-40 overflow-y-auto">
                        {referenceFiles.map((refFile, index) => (
                          <div key={index} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
                            <div className="flex items-center space-x-3 min-w-0 flex-1">
                              <svg className="w-8 h-8 text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0016.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{refFile.name}</p>
                                <p className="text-xs text-gray-500">{formatFileSize(refFile.size)}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleReferenceFileRemove(index)
                              }}
                              className="ml-3 p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500">Click to add more files</p>
                    </div>
                  ) : (
                    <div>
                      <svg className="w-12 h-12 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-sm text-gray-600 mb-1">
                        Drag and drop reference files here, or
                      </p>
                      <p className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
                        browse to choose files
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
                disabled={loading || (isDrafter && files.length === 0)}
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
