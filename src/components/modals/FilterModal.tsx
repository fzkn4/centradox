'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/lib/store'

interface FilterModalProps {
  isOpen: boolean
  onClose: () => void
  onApply: (filters: FilterState) => void
  currentFilters: FilterState
}

export interface FilterState {
  status: string
  statusGroup: string
  type: string
  priority: string
  timeframe: string
  startDate: string
  endDate: string
  overdue: boolean
  dueSoon: boolean
  department: string
}

export const initialFilterState: FilterState = {
  status: '',
  statusGroup: '',
  type: '',
  priority: '',
  timeframe: 'all',
  startDate: '',
  endDate: '',
  overdue: false,
  dueSoon: false,
  department: ''
}

export function FilterModal({ isOpen, onClose, onApply, currentFilters }: FilterModalProps) {
  const { token } = useAuthStore()
  const [filters, setFilters] = useState<FilterState>(currentFilters)
  const [departments, setDepartments] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'general' | 'date' | 'status'>('general')

  useEffect(() => {
    if (isOpen) {
      setFilters(currentFilters)
      fetchDepartments()
    }
  }, [isOpen, currentFilters])

  const fetchDepartments = async () => {
    try {
      const response = await fetch('/api/departments', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setDepartments(data.departments)
      }
    } catch (error) {
      console.error('Failed to fetch departments:', error)
    }
  }

  const handleReset = () => {
    setFilters(initialFilterState)
  }

  const handleApply = () => {
    onApply(filters)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Filter Documents</h3>
            <p className="text-sm text-gray-500">Refine your document view</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === 'general' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('status')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === 'status' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Status & Priority
          </button>
          <button
            onClick={() => setActiveTab('date')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === 'date' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Timeframe
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'general' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Document Type</label>
                <select
                  value={filters.type}
                  onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-gray-900"
                >
                  <option value="">All Types</option>
                  <option value="Policy">Policy</option>
                  <option value="Procedure">Procedure</option>
                  <option value="Report">Report</option>
                  <option value="Contract">Contract</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Department</label>
                <select
                  value={filters.department}
                  onChange={(e) => setFilters({ ...filters, department: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-gray-900"
                >
                  <option value="">All Departments</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {activeTab === 'status' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-3">Priority Level</label>
                <div className="grid grid-cols-2 gap-3">
                  {['RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'].map((p) => (
                    <button
                      key={p}
                      onClick={() => setFilters({ ...filters, priority: filters.priority === p ? '' : p })}
                      className={`px-3 py-2 text-xs font-bold rounded-lg border transition-all ${
                        filters.priority === p 
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' 
                          : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'
                      }`}
                    >
                      {p.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-3">Status Group</label>
                <div className="space-y-2">
                  {[
                    { id: 'draft', label: 'Draft', color: 'bg-gray-100' },
                    { id: 'in_progress', label: 'In Progress', color: 'bg-blue-100' },
                    { id: 'approved', label: 'Approved & Final', color: 'bg-green-100' }
                  ].map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setFilters({ ...filters, statusGroup: filters.statusGroup === g.id ? '' : g.id, status: '' })}
                      className={`w-full px-4 py-3 flex items-center justify-between rounded-xl border transition-all ${
                        filters.statusGroup === g.id 
                          ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600' 
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center">
                        <div className={`w-3 h-3 rounded-full mr-3 ${g.color}`} />
                        <span className={`text-sm font-medium ${filters.statusGroup === g.id ? 'text-indigo-700' : 'text-gray-700'}`}>
                          {g.label}
                        </span>
                      </div>
                      {filters.statusGroup === g.id && (
                        <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between p-3 rounded-xl bg-red-50/50 border border-red-100">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-red-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-bold text-red-700">Overdue Only</span>
                  </div>
                  <button
                    onClick={() => setFilters({ ...filters, overdue: !filters.overdue, dueSoon: false })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${filters.overdue ? 'bg-red-500' : 'bg-gray-200'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${filters.overdue ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-orange-50/50 border border-orange-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-orange-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className="text-sm font-bold text-orange-700">Due Soon (3 days)</span>
                  </div>
                  <button
                    onClick={() => setFilters({ ...filters, dueSoon: !filters.dueSoon, overdue: false })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${filters.dueSoon ? 'bg-orange-500' : 'bg-gray-200'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${filters.dueSoon ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'date' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-3">Timeframe Presets</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'all', label: 'All Time' },
                    { id: 'daily', label: 'Today' },
                    { id: 'weekly', label: 'This Week' },
                    { id: 'monthly', label: 'This Month' },
                    { id: 'yearly', label: 'This Year' },
                    { id: 'custom', label: 'Custom Range' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setFilters({ ...filters, timeframe: t.id })}
                      className={`px-4 py-2 text-sm font-medium rounded-xl border transition-all ${
                        filters.timeframe === t.id 
                          ? 'bg-indigo-600 border-indigo-600 text-white' 
                          : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {filters.timeframe === 'custom' && (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 animate-in slide-in-from-top-2 duration-300">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Start Date</label>
                    <input
                      type="date"
                      value={filters.startDate}
                      onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">End Date</label>
                    <input
                      type="date"
                      value={filters.endDate}
                      onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <button
            onClick={handleReset}
            className="text-sm font-bold text-gray-500 hover:text-red-600 transition-colors"
          >
            Reset Filters
          </button>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-6 py-2 text-sm font-bold text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-8 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all hover:-translate-y-0.5"
            >
              Apply Results
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
