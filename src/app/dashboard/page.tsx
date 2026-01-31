'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuthStore, useDocumentStore, useUiStore } from '@/lib/store'
import { getStatusColor, getStatusLabel } from '@/lib/permissions'
import { format, differenceInDays, isBefore, isAfter, addDays } from 'date-fns'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { NewDocumentModal } from '@/components/modals/NewDocumentModal'
import { ViewDocumentModal } from '@/components/modals/ViewDocumentModal'
import { FilterModal, initialFilterState, type FilterState } from '@/components/modals/FilterModal'

export default function DashboardPage() {
  const { user, isAuthenticated, token, isHydrated } = useAuthStore()
  const { documents, setDocuments, setLoading, isLoading } = useDocumentStore()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [activeFilters, setActiveFilters] = useState<FilterState>(initialFilterState)
  const [baseFilter, setBaseFilter] = useState('all')
  const { viewMode, setViewMode } = useUiStore()

  const loadDocuments = useCallback(async () => {
    setLoading(true)
    try {
      let url = '/api/documents'
      const params = new URLSearchParams()

      // Handle base filter (tabs)
      if (baseFilter === 'my') {
        params.append('myDocs', 'true')
      } else if (baseFilter !== 'all') {
        params.append('status', baseFilter)
      }

      // Handle advanced filters
      if (activeFilters.status) params.append('status', activeFilters.status)
      if (activeFilters.statusGroup && !activeFilters.status) params.append('statusGroup', activeFilters.statusGroup)
      if (activeFilters.type) params.append('type', activeFilters.type)
      if (activeFilters.priority) params.append('priority', activeFilters.priority)
      if (activeFilters.department) params.append('department', activeFilters.department)
      if (activeFilters.timeframe !== 'all') params.append('timeframe', activeFilters.timeframe)
      if (activeFilters.timeframe === 'custom') {
        if (activeFilters.startDate) params.append('startDate', activeFilters.startDate)
        if (activeFilters.endDate) params.append('endDate', activeFilters.endDate)
      }
      if (activeFilters.overdue) params.append('overdue', 'true')
      if (activeFilters.dueSoon) params.append('dueSoon', 'true')

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
  }, [baseFilter, activeFilters, token, setLoading, setDocuments])

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
      topSecret: documents.filter(d => d.priority === 'TOP_SECRET').length,
      secret: documents.filter(d => d.priority === 'SECRET').length
    }
  }, [documents])

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'TOP_SECRET': return 'bg-red-100 text-red-800 border-red-200'
      case 'SECRET': return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'CONFIDENTIAL': return 'bg-green-100 text-green-800 border-green-200'
      case 'RESTRICTED': return 'bg-blue-100 text-blue-800 border-blue-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getDeadlineStatus = (deadline: string | null) => {
    if (!deadline) return { label: 'No Deadline', class: 'text-gray-400 bg-gray-50' }
    const now = new Date()
    const deadlineDate = new Date(deadline)
    if (deadlineDate < now) return { label: 'Overdue', class: 'text-red-600 bg-red-50' }
    const daysUntil = differenceInDays(deadlineDate, now)
    if (daysUntil <= 3) return { label: 'Due Soon', class: 'text-orange-600 bg-orange-50' }
    if (daysUntil <= 7) return { label: 'Upcoming', class: 'text-yellow-600 bg-yellow-50' }
    return { label: 'On Track', class: 'text-green-600 bg-green-50' }
  }

  const getWorkflowProgress = (doc: any) => {
    // If the document is approved or final, it's 100% complete
    if (doc.currentStatus === 'APPROVED' || doc.currentStatus === 'FINAL') {
      return { percentage: 100 }
    }

    const workflow = doc.workflowInstances?.[0]
    if (!workflow) return { percentage: 0 }

    // If currentStep is 999, it signifies terminal completion in the instance
    if (workflow.currentStep === 999 || workflow.completedAt) {
      return { percentage: 100 }
    }

    const steps = workflow.steps || []
    if (steps.length === 0) return { percentage: 0 }

    const completedSteps = steps.filter((s: any) => s.status === 'COMPLETED').length
    const percentage = Math.round((completedSteps / steps.length) * 100)

    return { percentage }
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
                <p className="text-yellow-600 text-sm font-medium">Critical Priority</p>
                <p className="text-3xl font-bold text-yellow-700 mt-1">{stats.topSecret + stats.secret}</p>
              </div>
              <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setBaseFilter('all')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  baseFilter === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All Documents
              </button>
              <button
                onClick={() => setBaseFilter('my')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  baseFilter === 'my'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                My Documents
              </button>
              <button
                onClick={() => setBaseFilter('DRAFT')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  baseFilter === 'DRAFT'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Draft
              </button>
              <button
                onClick={() => setBaseFilter('FOR_REVIEW')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  baseFilter === 'FOR_REVIEW'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                For Review
              </button>
              <button
                onClick={() => setBaseFilter('APPROVED')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  baseFilter === 'APPROVED'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Approved
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilterModalOpen(true)}
                className="relative p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl border border-gray-200 transition-all flex items-center space-x-2 px-4 group"
              >
                <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 8.293A1 1 0 013 7.586V4z" />
                </svg>
                <span className="text-sm font-bold">Filters</span>
                {Object.values(activeFilters).filter(v => v !== '' && v !== false && v !== 'all').length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white ring-2 ring-white animate-in zoom-in duration-300">
                    {Object.values(activeFilters).filter(v => v !== '' && v !== false && v !== 'all').length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setViewMode(viewMode === 'cards' ? 'table' : 'cards')}
                className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl border border-gray-200 transition-all flex items-center space-x-2 px-4 group"
                title={viewMode === 'cards' ? 'Switch to Table View' : 'Switch to Card View'}
              >
                {viewMode === 'cards' ? (
                  <>
                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                    <span className="text-sm font-bold">Table</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                    <span className="text-sm font-bold">Cards</span>
                  </>
                )}
              </button>
            </div>
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
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-500">
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
                    className="group bg-white border border-gray-100 rounded-xl p-5 hover:shadow-xl hover:border-indigo-100 transition-all cursor-pointer relative overflow-hidden"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase ${
                        doc.priority === 'TOP_SECRET' ? 'bg-red-50 text-red-600' :
                        doc.priority === 'SECRET' ? 'bg-orange-50 text-orange-600' :
                        doc.priority === 'CONFIDENTIAL' ? 'bg-green-50 text-green-600' : 'bg-indigo-50 text-indigo-600'
                      }`}>
                        {doc.priority?.replace('_', ' ')}
                      </span>
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${getStatusColor(doc.currentStatus)}`}>
                        {getStatusLabel(doc.currentStatus)}
                      </span>
                    </div>

                    <h4 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors line-clamp-1 mb-1">{doc.title}</h4>
                    <p className="text-xs text-gray-500 mb-4">{doc.type} • {doc.departments?.[0]?.department?.name || 'General'}</p>

                    <div className="space-y-4">
                      {/* Progress Bar */}
                      <div>
                        <div className="flex justify-between items-center text-[10px] mb-1">
                          <span className="text-gray-500 font-medium">Workflow Progress</span>
                          <span className="text-indigo-600 font-bold">{workflowProgress?.percentage || 0}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="bg-indigo-600 h-full rounded-full transition-all duration-1000"
                            style={{ width: `${workflowProgress?.percentage || 0}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                        <div className="flex items-center space-x-2">
                          <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-700">
                            {doc.createdBy?.name?.charAt(0)}
                          </div>
                          <span className="text-[10px] text-gray-600 font-medium">{doc.createdBy?.name}</span>
                        </div>
                        <div className="flex items-center text-[10px] font-bold">
                          <svg className={`w-3 h-3 mr-1 ${deadlineStatus.class.split(' ')[0]}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className={deadlineStatus.class.split(' ')[0]}>{deadlineStatus.label}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="overflow-x-auto animate-in fade-in duration-500">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Document</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Type & Dept</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Priority</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Progress</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Deadline</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {documents.map((doc) => {
                    const deadlineStatus = getDeadlineStatus(doc.deadline)
                    const workflowProgress = getWorkflowProgress(doc)
                    
                    return (
                      <tr 
                        key={doc.id}
                        className="hover:bg-indigo-50/30 transition-colors group cursor-pointer border-b border-gray-50 last:border-0"
                        onClick={() => {
                          setSelectedDocumentId(doc.id)
                          setViewModalOpen(true)
                        }}
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center">
                            <div>
                              <div className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors text-sm">{doc.title}</div>
                              <div className="text-[10px] text-gray-500">Created {format(new Date(doc.createdAt), 'MMM dd, yyyy')}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-xs font-semibold text-gray-700">{doc.type}</div>
                          <div className="text-[10px] text-gray-500">{doc.departments?.[0]?.department?.name || 'General'}</div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            doc.priority === 'TOP_SECRET' ? 'bg-red-50 text-red-600' :
                            doc.priority === 'SECRET' ? 'bg-orange-50 text-orange-600' :
                            doc.priority === 'CONFIDENTIAL' ? 'bg-green-50 text-green-600' : 'bg-indigo-50 text-indigo-600'
                          }`}>
                            {doc.priority?.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getStatusColor(doc.currentStatus)}`}>
                            {getStatusLabel(doc.currentStatus)}
                          </span>
                        </td>
                        <td className="px-4 py-4 w-32">
                          <div className="flex items-center space-x-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                              <div 
                                className="bg-indigo-600 h-full rounded-full"
                                style={{ width: `${workflowProgress?.percentage || 0}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-bold text-indigo-600">{workflowProgress?.percentage || 0}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className={`flex items-center text-[10px] font-bold ${deadlineStatus.class.split(' ')[0]}`}>
                            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {deadlineStatus.label}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button className="p-2 hover:bg-white rounded-lg transition-colors text-gray-400 hover:text-indigo-600 border border-transparent hover:border-indigo-100">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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

      <FilterModal
        isOpen={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        onApply={setActiveFilters}
        currentFilters={activeFilters}
      />
    </AdminLayout>
  )
}

