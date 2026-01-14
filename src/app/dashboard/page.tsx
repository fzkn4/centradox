'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuthStore, useDocumentStore } from '@/lib/store'
import { getStatusColor, getStatusLabel } from '@/lib/permissions'
import { format } from 'date-fns'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { NewDocumentModal } from '@/components/modals/NewDocumentModal'
import { ViewDocumentModal } from '@/components/modals/ViewDocumentModal'

export default function DashboardPage() {
  const { user, isAuthenticated, token, isHydrated } = useAuthStore()
  const { documents, setDocuments, setLoading, isLoading } = useDocumentStore()
  const [filter, setFilter] = useState('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)

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

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
          >
            New Document
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex space-x-2 mb-6">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                filter === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Documents
            </button>
            <button
              onClick={() => setFilter('my')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                filter === 'my'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              My Documents
            </button>
            <button
              onClick={() => setFilter('DRAFT')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                filter === 'DRAFT'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Draft
            </button>
            <button
              onClick={() => setFilter('FOR_REVIEW')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                filter === 'FOR_REVIEW'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              For Review
            </button>
            <button
              onClick={() => setFilter('APPROVED')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                filter === 'APPROVED'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Approved
            </button>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading documents...</div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No documents found. Create your first document!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Title
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Author
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Updated
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {documents.map((doc) => (
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
