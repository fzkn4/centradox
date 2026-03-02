'use client'

import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export const initSocket = () => {
  if (!socket) {
    // Connect to the same origin host/port automatically
    socket = io()
  }
  return socket
}

export const getSocket = () => socket

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
