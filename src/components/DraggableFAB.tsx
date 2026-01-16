'use client'

import { useEffect, useState, useRef } from 'react'
import { BellIcon, TrashIcon, DocumentTextIcon, CheckCircleIcon, ExclamationTriangleIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { useAuthStore, useNotificationStore } from '@/lib/store'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { ViewDocumentModal } from '@/components/modals/ViewDocumentModal'

export function DraggableFAB() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, token } = useAuthStore()
  const { notifications, unreadCount, setNotifications, markAsRead, markAllAsRead, deleteNotification, setLoading, setError } = useNotificationStore()
  const [isOpen, setIsOpen] = useState(false)
  const [previousUnreadCount, setPreviousUnreadCount] = useState(0)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'document_created':
        return <DocumentTextIcon className="w-4 h-4 text-blue-500" />
      case 'document_approved':
        return <CheckCircleIcon className="w-4 h-4 text-green-500" />
      case 'step_completed':
        return <ExclamationTriangleIcon className="w-4 h-4 text-yellow-500" />
      default:
        return <BellIcon className="w-4 h-4 text-gray-500" />
    }
  }

  const truncateMessage = (message: string, maxLength: number = 60) => {
    if (message.length <= maxLength) return message
    return message.substring(0, maxLength) + '...'
  }

  const formatTimeAgo = (date: string) => {
    const now = new Date()
    const notificationDate = new Date(date)
    const diffInMinutes = Math.floor((now.getTime() - notificationDate.getTime()) / (1000 * 60))

    if (diffInMinutes < 1) return 'Just now'
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`

    const diffInHours = Math.floor(diffInMinutes / 60)
    if (diffInHours < 24) return `${diffInHours}h ago`

    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays < 7) return `${diffInDays}d ago`

    return notificationDate.toLocaleDateString()
  }

  const playNotificationSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1)

      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.3)
    } catch (error) {
      console.warn('Audio not supported:', error)
    }
  }

  useEffect(() => {
    const fetchNotifications = async () => {
      if (!token) return

      try {
        const response = await fetch('/api/notifications', {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (response.ok) {
          const data = await response.json()
          const serverNotifications = data.notifications

          // setNotifications now automatically merges with persisted read states
          setNotifications(serverNotifications)

          // Play sound for new unread notifications
          const newUnreadCount = serverNotifications.filter((n: any) => !n.read).length
          if (newUnreadCount > previousUnreadCount) {
            playNotificationSound()
          }
          setPreviousUnreadCount(newUnreadCount)
        }
      } catch (error) {
        console.error('Failed to fetch notifications:', error)
      }
    }

    // Initial fetch
    fetchNotifications()

    // Automatic refresh every 30 seconds
    const interval = setInterval(fetchNotifications, 30000)

    return () => clearInterval(interval)
  }, [setNotifications, previousUnreadCount, token])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  if (pathname === '/login') {
    return null
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed top-4 right-4 p-3 rounded-full shadow-lg transition-all duration-300 z-50 transform hover:scale-105 active:scale-95 ${
          unreadCount > 0
            ? 'bg-red-500 hover:bg-red-600 shadow-red-200'
            : 'bg-white hover:bg-gray-50 border border-gray-200'
        } ${isOpen ? 'scale-105' : ''}`}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <BellIcon className={`w-5 h-5 ${unreadCount > 0 ? 'text-white' : 'text-gray-600'}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full min-w-[20px] text-center shadow-md animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div ref={dropdownRef} className="fixed top-16 right-4 bg-white border border-gray-200 rounded-xl shadow-xl p-0 max-w-sm w-full max-h-96 overflow-hidden z-50">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BellIcon className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="bg-red-500 text-white text-xs font-medium px-2 py-1 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Close notifications"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Actions */}
          {notifications.length > 0 && unreadCount > 0 && (
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
              <button
                onClick={async () => {
                  // Mark all as read
                  const unreadNotifications = notifications.filter(n => !n.read)
                  for (const notification of unreadNotifications) {
                    await fetch(`/api/notifications/${notification.id}/read`, { method: 'POST' })
                  }
                  markAllAsRead()
                }}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors"
              >
                <EyeIcon className="w-4 h-4" />
                Mark all as read
              </button>
            </div>
          )}

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <BellIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">No notifications yet</p>
                <p className="text-gray-400 text-xs mt-1">You'll see updates here when documents are created or updated</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {notifications.map((notification) => (
                  <li key={notification.id} className={`group hover:bg-gray-50 transition-colors ${notification.read ? 'bg-white' : 'bg-blue-50/50'}`}>
                    <div className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        {/* Notification Icon */}
                        <div className="flex-shrink-0 mt-0.5">
                          {getNotificationIcon(notification.type)}
                        </div>

                        {/* Content */}
                          <div className="flex-1 min-w-0">
                          <div
                            className="cursor-pointer group/content"
                            onClick={async () => {
                              if (!notification.read) {
                                await fetch(`/api/notifications/${notification.id}/read`, {
                                  method: 'POST',
                                  headers: { Authorization: `Bearer ${token}` }
                                })
                                markAsRead(notification.id)
                              }
                              if (notification.documentId) {
                                setSelectedDocumentId(notification.documentId)
                                setViewModalOpen(true)
                              }
                              setIsOpen(false)
                            }}
                          >
                            <p className="text-sm text-gray-900 leading-relaxed group-hover/content:text-blue-900 transition-colors">
                              {truncateMessage(notification.message)}
                            </p>
                            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                              <span>{formatTimeAgo(notification.createdAt)}</span>
                              {!notification.read && (
                                <>
                                  <span className="w-1 h-1 bg-blue-500 rounded-full"></span>
                                  <span className="text-blue-600 font-medium">New</span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!notification.read && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation()
                                await fetch(`/api/notifications/${notification.id}/read`, { method: 'POST' })
                                markAsRead(notification.id)
                              }}
                              className="text-gray-400 hover:text-gray-600 p-1 rounded transition-colors"
                              aria-label="Mark as read"
                              title="Mark as read"
                            >
                              <EyeIcon className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={async (e) => {
                              e.stopPropagation()
                              await fetch(`/api/notifications/${notification.id}/delete`, { method: 'DELETE' })
                              deleteNotification(notification.id)
                            }}
                            className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                            aria-label="Delete notification"
                            title="Delete notification"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="bg-gray-50 px-4 py-2 border-t border-gray-100">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{notifications.length} notification{notifications.length !== 1 ? 's' : ''}</span>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <ViewDocumentModal
        isOpen={viewModalOpen}
        onClose={() => {
          setViewModalOpen(false)
          setSelectedDocumentId(null)
        }}
        documentId={selectedDocumentId}
      />
    </>
  )
}