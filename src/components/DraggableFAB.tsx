'use client'

import { useEffect, useState, useRef } from 'react'
import { BellIcon } from '@heroicons/react/24/outline'
import { useNotificationStore } from '@/lib/store'
import { usePathname } from 'next/navigation'

export function DraggableFAB() {
  const pathname = usePathname()
  const { notifications, unreadCount, setNotifications, setLoading, setError } = useNotificationStore()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchNotifications = async () => {
      setLoading(true)
      try {
        const response = await fetch('/api/notifications')
        if (response.ok) {
          const data = await response.json()
          setNotifications(data.notifications)
        } else {
          setError('Failed to fetch notifications')
        }
      } catch (error) {
        console.error('Failed to fetch notifications:', error)
        setError('Failed to fetch notifications')
      } finally {
        setLoading(false)
      }
    }

    fetchNotifications()
  }, [setNotifications, setLoading, setError])

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
        className="fixed top-4 right-4 bg-red-500 hover:bg-red-600 text-white p-3 rounded-full shadow-lg transition-all duration-200 z-50"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <BellIcon className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full min-w-[20px] text-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div ref={dropdownRef} className="fixed top-16 right-4 bg-white border border-gray-200 rounded-lg shadow-lg p-4 max-w-sm w-full max-h-96 overflow-y-auto z-50">
          <h3 className="text-lg font-semibold mb-2">Notifications</h3>
          {notifications.length === 0 ? (
            <p className="text-gray-500">No notifications</p>
          ) : (
            <ul className="space-y-2">
              {notifications.map((notification) => (
                <li key={notification.id} className={`p-2 rounded ${notification.read ? 'bg-gray-100' : 'bg-blue-50'}`}>
                  <p className="text-sm">{notification.message}</p>
                  <p className="text-xs text-gray-500">{new Date(notification.createdAt).toLocaleDateString()}</p>
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={() => setIsOpen(false)}
            className="mt-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Close
          </button>
        </div>
      )}
    </>
  )
}