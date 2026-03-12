'use client'

import { useState, useEffect } from 'react'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { useAuthStore } from '@/lib/store'
import { sileo } from 'sileo'
import { UserCircleIcon, KeyIcon, DevicePhoneMobileIcon } from '@heroicons/react/24/outline'

export default function SettingsPage() {
  const { token, isAuthenticated, isHydrated, user, setUser } = useAuthStore()
  
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    password: '',
    confirmPassword: '',
    phoneNumber: ''
  })
  
  const [profileData, setProfileData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  
  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      window.location.href = '/login'
      return
    }
    
    const fetchProfile = async () => {
      if (!token) return
      
      try {
        const response = await fetch('/api/users/me', {
          headers: { Authorization: `Bearer ${token}` }
        })
        
        if (response.ok) {
          const data = await response.json()
          setProfileData(data.user)
          setFormData(prev => ({
            ...prev,
            username: data.user.username || '',
            name: data.user.name || '',
            phoneNumber: data.user.phoneNumber || ''
          }))
        } else {
          sileo.error({ description: 'Failed to load profile details' })
        }
      } catch (error) {
        console.error('Error fetching profile:', error)
        sileo.error({ description: 'Failed to load profile details' })
      } finally {
        setIsLoading(false)
      }
    }
    
    if (isAuthenticated && isHydrated) {
      fetchProfile()
    }
  }, [isAuthenticated, isHydrated, token])
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (formData.password && formData.password !== formData.confirmPassword) {
      sileo.error({ description: 'Passwords do not match' })
      return
    }
    
    setIsSaving(true)
    try {
      const response = await fetch('/api/users/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          username: formData.username,
          name: formData.name,
          password: formData.password || undefined,
          phoneNumber: formData.phoneNumber
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        sileo.success({ description: 'Profile updated successfully' })
        
        // Clear password fields
        setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }))
        
        // Update local user store state
        if (user && setUser) {
          setUser({
            ...user,
            username: data.user.username,
            name: data.user.name
          })
        }
      } else {
        const data = await response.json()
        sileo.error({ description: data.error || 'Failed to update profile' })
      }
    } catch (error) {
      console.error('Error saving profile:', error)
      sileo.error({ description: 'An unexpected error occurred' })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your personal information and security preferences.
          </p>
        </div>

        <div className="bg-white shadow rounded-xl border border-gray-100 overflow-hidden">
          <form onSubmit={handleSubmit} className="divide-y divide-gray-200">
            
            {/* Profile Info Section */}
            <div className="p-6 space-y-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-indigo-50 p-2 rounded-lg">
                  <UserCircleIcon className="w-6 h-6 text-indigo-600" />
                </div>
                <h2 className="text-lg font-medium text-gray-900">Profile Information</h2>
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Full Name</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-4 py-2 border text-gray-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Username</label>
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-4 py-2 border text-gray-900"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 flex items-center gap-1">
                    <DevicePhoneMobileIcon className="w-4 h-4 text-gray-400" />
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    name="phoneNumber"
                    value={formData.phoneNumber}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-4 py-2 border text-gray-900"
                  />
                </div>
              </div>

              {profileData && (
                 <div className="bg-gray-50 rounded-lg p-4 mt-6 flex items-start space-x-4">
                   <div className="flex-1">
                     <p className="text-sm font-medium text-gray-900">Account Role</p>
                     <p className="text-sm text-gray-500 mt-1">
                       You are currently assigned the <span className="font-bold text-indigo-600">{profileData.role}</span> role. Contact an administrator to request changes to your role or department assignments.
                     </p>
                   </div>
                 </div>
              )}
            </div>

            {/* Security Section */}
            <div className="p-6 space-y-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-orange-50 p-2 rounded-lg">
                  <KeyIcon className="w-6 h-6 text-orange-600" />
                </div>
                <h2 className="text-lg font-medium text-gray-900">Security</h2>
              </div>
              
              <p className="text-sm text-gray-500 mb-4">Leave the password fields blank if you do not wish to change your password.</p>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">New Password</label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm px-4 py-2 border text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm px-4 py-2 border text-gray-900"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? 'Saving Changes...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  )
}
