'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { Socket } from 'socket.io-client'
import { initSocket, disconnectSocket } from '@/lib/socket'
import { useAuthStore } from '@/lib/store'

interface SocketContextType {
  socket: Socket | null
  isConnected: boolean
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
})

export const useSocket = () => useContext(SocketContext)

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const { isAuthenticated, isHydrated } = useAuthStore()

  useEffect(() => {
    // Only connect if the user is authenticated and the store is hydrated
    if (isHydrated && isAuthenticated) {
      const socketInstance = initSocket()
      setSocket(socketInstance)

      socketInstance.on('connect', () => {
        setIsConnected(true)
      })

      socketInstance.on('disconnect', () => {
        setIsConnected(false)
      })

      return () => {
        // We do not strictly disconnect here on unmount of the provider
        // so that navigation between pages doesn't sever the connection.
        // It will disconnect on full logout.
      }
    } else if (isHydrated && !isAuthenticated) {
      // Disconnect when logged out
      disconnectSocket()
      setSocket(null)
      setIsConnected(false)
    }
  }, [isAuthenticated, isHydrated])

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  )
}
