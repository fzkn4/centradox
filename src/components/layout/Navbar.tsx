'use client'

import Link from 'next/link'
import { useAuthStore } from '@/lib/store'

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuthStore()

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center text-xl font-bold text-indigo-600">
              <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Centradox
            </Link>
             <div className="ml-8 flex space-x-4">
               <Link
                 href="/dashboard"
                 className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
               >
                 Dashboard
               </Link>
             </div>
          </div>
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                <span className="text-sm text-gray-700">
                  {user?.name}
                </span>
                <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded">
                  {user?.role}
                </span>
                <button
                  onClick={logout}
                  className="text-sm text-gray-700 hover:text-gray-900"
                >
                  Logout
                </button>
              </>
             ) : (
               <Link
                 href="/login"
                 className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
               >
                 Login
               </Link>
             )}
          </div>
        </div>
      </div>
    </nav>
  )
}
