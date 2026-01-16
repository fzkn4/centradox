import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  username: string
  name: string
  role: string
  department: string
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
  department?: { id: string; name: string }
  versions?: any[]
  comments?: any[]
  workflowInstances?: any[]
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
  setNotifications: (notifications: Notification[]) => void
  addNotification: (notification: Notification) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  deleteNotification: (id: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  setNotifications: (notifications) => set({
    notifications,
    unreadCount: notifications.filter(n => !n.read).length
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
      unreadCount: updated.filter(n => !n.read).length
    }
  }),
  markAllAsRead: () => set((state) => ({
    notifications: state.notifications.map(n => ({ ...n, read: true })),
    unreadCount: 0
  })),
  deleteNotification: (id) => set((state) => {
    const filtered = state.notifications.filter(n => n.id !== id)
    return {
      notifications: filtered,
      unreadCount: filtered.filter(n => !n.read).length
    }
  }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error })
}))
