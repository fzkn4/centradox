'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuthStore, useDocumentStore } from '@/lib/store'
import { getStatusColor, getStatusLabel } from '@/lib/permissions'
import { format } from 'date-fns'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { NewDocumentModal } from '@/components/modals/NewDocumentModal'
import { ViewDocumentModal } from '@/components/modals/ViewDocumentModal'

interface Department {
  id: string
  name: string
}

export default function AllDocumentsPage() {
  const { user, isAuthenticated, token, isHydrated } = useAuthStore()
  const { documents, setDocuments, setLoading, isLoading } = useDocumentStore()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all')
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(false)

  const loadDepartments = useCallback(async () => {
    setIsLoadingDepartments(true)
    try {
      const response = await fetch('/api/departments', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setDepartments(data.departments)
      }
    } catch (error) {
      console.error('Failed to load departments:', error)
    } finally {
      setIsLoadingDepartments(false)
    }
  }, [token])

  const loadDocuments = useCallback(async () => {
    setLoading(true)
    try {
      const url = '/api/documents'

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
  }, [token, setLoading, setDocuments])

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      window.location.href = '/login'
      return
    }
    if (isHydrated && isAuthenticated) {
      loadDocuments()
      loadDepartments()
    }
  }, [isAuthenticated, isHydrated, loadDocuments, loadDepartments])

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc: any) => {
      if (selectedDepartment === 'all') return true
      if (selectedDepartment === 'unassigned') {
        return !doc.departments || doc.departments.length === 0
      }
      return doc.departments?.some((d: any) => d.department.id === selectedDepartment)
    })
  }, [documents, selectedDepartment])

  const groupedDocs = useMemo(() => {
    const groups: Record<string, typeof documents> = {}
    
    if (selectedDepartment !== 'all') {
      const blockName = selectedDepartment === 'unassigned' 
        ? 'Unassigned' 
        : departments.find(d => d.id === selectedDepartment)?.name || 'Documents'
        
      groups[blockName] = filteredDocuments
    } else {
      filteredDocuments.forEach((doc: any) => {
        if (!doc.departments || doc.departments.length === 0) {
          if (!groups['Unassigned']) groups['Unassigned'] = []
          groups['Unassigned'].push(doc)
        } else {
          doc.departments.forEach((d: any) => {
            if (!groups[d.department.name]) groups[d.department.name] = []
            groups[d.department.name].push(doc)
          })
        }
      })
    }
    return groups
  }, [filteredDocuments, selectedDepartment, departments])

  const sortedGroupKeys = Object.keys(groupedDocs).sort()

  const renderDocumentTable = (docs: typeof documents) => (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Author</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Updated</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {docs.map((doc: any) => (
            <tr key={doc.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">{doc.title}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-500">{doc.type}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(doc.currentStatus)}`}>
                  {getStatusLabel(doc.currentStatus)}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-500">{doc.createdBy.name}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-500">
                  {format(new Date(doc.updatedAt), 'MMM dd, yyyy')}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button
                  onClick={() => {
                    setSelectedDocumentId(doc.id)
                    setViewModalOpen(true)
                  }}
                  className="text-indigo-600 hover:text-indigo-900"
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">All Documents</h1>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
          >
            New Document
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-gray-900">Filter Documents</h2>
            <div className="flex items-center space-x-2">
              <label htmlFor="department-filter" className="text-sm font-medium text-gray-700">
                Department:
              </label>
              <select
                id="department-filter"
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="block w-full sm:w-64 pl-3 pr-10 py-2 text-base border-gray-300 border rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                disabled={isLoadingDepartments}
              >
                <option value="all">All Departments</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
                <option value="unassigned">Unassigned</option>
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center py-8 text-gray-500">
            Loading documents...
          </div>
        ) : documents.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center py-8 text-gray-500">
            No documents found. Create your first document!
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center py-8 text-gray-500">
            No documents found for the selected department.
          </div>
        ) : (
          <div className="space-y-6">
            {sortedGroupKeys.map(groupName => (
              <div key={groupName} className="bg-white rounded-lg shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                  <h3 className="text-lg font-medium text-gray-900">{groupName}</h3>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    {groupedDocs[groupName].length} document{groupedDocs[groupName].length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="p-0 sm:p-2">
                  {renderDocumentTable(groupedDocs[groupName])}
                </div>
              </div>
            ))}
          </div>
        )}
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