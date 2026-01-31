import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  username: string
  name: string
  role: string
  departmentIds: string[]
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isHydrated: boolean
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  logout: () => void
  login: (user: User, token: string) => void
  setHydrated: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isHydrated: false,
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setToken: (token) => set({ token }),
      logout: () => set({ user: null, token: null, isAuthenticated: false }),
      login: (user, token) => set({ user, token, isAuthenticated: true }),
      setHydrated: () => set({ isHydrated: true })
    }),
    {
      name: 'auth-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHydrated()
        }
      }
    }
  )
)

interface Document {
  id: string
  title: string
  type: string
  currentStatus: string
  currentVersionId: string | null
  lockedBy: string | null
  priority: string
  deadline: string | null
  createdAt: string
  updatedAt: string
  createdById: string
  createdBy: User
  departments?: { 
    department: { 
      id: string; 
      name: string 
    } 
  }[]
  versions?: any[]
  comments?: any[]
  workflowInstances?: {
    id: string
    currentStep: number
    completedAt: string | null
    steps: {
      id: string
      status: string
      stepOrder: number
    }[]
  }[]
}

interface DocumentState {
  documents: Document[]
  currentDocument: Document | null
  isLoading: boolean
  error: string | null
  setDocuments: (documents: Document[]) => void
  setCurrentDocument: (document: Document | null) => void
  addDocument: (document: Document) => void
  updateDocument: (document: Document) => void
  removeDocument: (id: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useDocumentStore = create<DocumentState>((set) => ({
  documents: [],
  currentDocument: null,
  isLoading: false,
  error: null,
  setDocuments: (documents) => set({ documents }),
  setCurrentDocument: (document) => set({ currentDocument: document }),
  addDocument: (document) => set((state) => ({ documents: [document, ...state.documents] })),
  updateDocument: (document) =>
    set((state) => ({
      documents: state.documents.map((d) => (d.id === document.id ? document : d)),
      currentDocument: state.currentDocument?.id === document.id ? document : state.currentDocument
    })),
  removeDocument: (id) =>
    set((state) => ({
      documents: state.documents.filter((d) => d.id !== id),
      currentDocument: state.currentDocument?.id === id ? null : state.currentDocument
    })),
   setLoading: (loading) => set({ isLoading: loading }),
   setError: (error) => set({ error })
 }))

interface Notification {
  id: string
  type: string
  message: string
  documentId?: string
  read: boolean
  createdAt: string
}

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  isLoading: boolean
  error: string | null
  readStates: Record<string, boolean> // Persisted read states
  setNotifications: (notifications: Notification[]) => void
  addNotification: (notification: Notification) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  deleteNotification: (id: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  cleanupReadStates: () => void
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      unreadCount: 0,
      isLoading: false,
      error: null,
      readStates: {},
  setNotifications: (notifications) => set((state) => {
    // Merge server notifications with persisted read states
    const mergedNotifications = notifications.map(notification => ({
      ...notification,
      read: state.readStates[notification.id] ?? notification.read
    }))

    return {
      notifications: mergedNotifications,
      unreadCount: mergedNotifications.filter(n => !n.read).length
    }
  }),
  addNotification: (notification) => set((state) => {
    const newNotifications = [notification, ...state.notifications]
    return {
      notifications: newNotifications,
      unreadCount: newNotifications.filter(n => !n.read).length
    }
  }),
  markAsRead: (id) => set((state) => {
    const updated = state.notifications.map(n => n.id === id ? { ...n, read: true } : n)
    return {
      notifications: updated,
      unreadCount: updated.filter(n => !n.read).length,
      readStates: { ...state.readStates, [id]: true }
    }
  }),
  markAllAsRead: () => set((state) => {
    const readStates = { ...state.readStates }
    state.notifications.forEach(n => {
      readStates[n.id] = true
    })
    return {
      notifications: state.notifications.map(n => ({ ...n, read: true })),
      unreadCount: 0,
      readStates
    }
  }),
  deleteNotification: (id) => set((state) => {
    const filtered = state.notifications.filter(n => n.id !== id)
    const { [id]: deleted, ...remainingReadStates } = state.readStates
    return {
      notifications: filtered,
      unreadCount: filtered.filter(n => !n.read).length,
      readStates: remainingReadStates
    }
  }),
   setLoading: (loading) => set({ isLoading: loading }),
   setError: (error) => set({ error }),
   cleanupReadStates: () => set((state) => {
     // Remove read states for notifications that no longer exist
     const currentNotificationIds = new Set(state.notifications.map(n => n.id))
     const cleanedReadStates: Record<string, boolean> = {}

     Object.entries(state.readStates).forEach(([id, read]) => {
       if (currentNotificationIds.has(id)) {
         cleanedReadStates[id] = read
       }
     })

     return { readStates: cleanedReadStates }
   })
 }),
{
  name: 'notification-storage',
  partialize: (state) => ({ readStates: state.readStates }),
  onRehydrateStorage: () => (state) => {
    // Handle hydration completion if needed
    console.log('Notification store rehydrated')
  }
}
))

interface UiState {
  viewMode: 'cards' | 'table'
  setViewMode: (mode: 'cards' | 'table') => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      viewMode: 'cards',
      setViewMode: (mode) => set({ viewMode: mode })
    }),
    {
      name: 'ui-storage'
    }
  )
)
