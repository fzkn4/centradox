'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useAuthStore } from '@/lib/store'
import { getStatusColor, getStatusLabel, getComplianceTypeLabel, canUserCancelDocument } from '@/lib/permissions'
import { format } from 'date-fns'
import { sileo } from 'sileo'
import { renderAsync } from 'docx-preview'
import { ReactSketchCanvas, ReactSketchCanvasRef } from 'react-sketch-canvas'
import { toPng } from 'html-to-image'
import { v4 as uuidv4 } from 'uuid'
import { Pen, Eraser, Hand, Type } from 'lucide-react'

interface Textbox {
  id: string
  x: number
  y: number
  text: string
  color: string
  fontSize: number
  isEditing: boolean
}

interface DocumentVersion {
  id: string
  versionNumber: number
  fileName: string
  fileSize: number
  mimeType: string
  createdAt: string
  createdBy: {
    id: string
    name: string
  }
}

interface DocumentFileAnnotation {
  id: string
  fileName: string
  fileSize: number
  mimeType: string
  pageNumber: number
  workflowStepId?: string | null
  createdAt: string
  createdById: string
}

interface DocumentFile {
  id: string
  fileName: string
  fileSize: number
  mimeType: string
  isPrimary: boolean
  createdAt: string
  annotations?: DocumentFileAnnotation[]
}

interface DocumentRevision {
  id: string
  revisionNumber: number
  createdAt: string
  createdBy: {
    id: string
    username: string
    name: string
    role: string
  }
  files: DocumentFile[]
}

interface WorkflowStep {
  id: string
  stepOrder: number
  department: {
    id: string
    name: string
    users?: { id: string; name: string; role: string }[]
  } | null
  role: string
  status: string
  assignedTo: {
    id: string
    name: string
    phoneNumber?: string | null
  } | null
  completedBy: {
    id: string
    name: string
    role: string
    phoneNumber?: string | null
  } | null
  completedAt: string | null
  comment: string | null
  confidentialComment?: string | null
  confidentialCommentVisibleTo?: string | null
}

interface WorkflowInstance {
  id: string
  currentStep: number
  startedAt: string
  completedAt: string | null
  steps: WorkflowStep[]
}

interface DocumentData {
  id: string
  title: string
  type: string
  currentStatus: string
  priority: string
  complianceType: string | null
  deadline: string | null
  createdAt: string
  updatedAt: string
  createdBy: {
    id: string
    name: string
    role: string
    phoneNumber?: string | null
  }
  departments: {
    department: {
      id: string
      name: string
    }
  }[]
  referenceFiles: {
    id: string
    fileName: string
    fileSize: number
    mimeType: string
    filePath: string
  }[]
  currentRevisionId: string | null
  revisions: DocumentRevision[]
  // Legacy (pre multi-file revisions)
  currentVersionId?: string | null
  versions?: DocumentVersion[]
  workflowInstances: WorkflowInstance[]
}

interface ViewDocumentModalProps {
  isOpen: boolean
  onClose: () => void
  documentId: string | null
}

export function ViewDocumentModal({ isOpen, onClose, documentId }: ViewDocumentModalProps) {
  const { token, user } = useAuthStore()
  const [doc, setDoc] = useState<DocumentData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'details' | 'workflow' | 'versions' | 'complete' | 'preview'>('details')

  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null)
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewType, setPreviewType] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [paginatedPreview, setPaginatedPreview] = useState<{
    fileId: string
    page: number
    pages: number
  } | null>(null)
  const docxContainerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const annotationPreviewUrlsRef = useRef<Record<string, string>>({})

  const selectedRevision = useMemo(() => {
    if (!doc) return null
    return doc.revisions.find(r => r.id === selectedRevisionId) ?? doc.revisions[0] ?? null
  }, [doc, selectedRevisionId])

  const selectedFile = useMemo(() => {
    if (!selectedRevision) return null
    return (
      selectedRevision.files.find(f => f.id === selectedFileId) ??
      selectedRevision.files.find(f => f.isPrimary) ??
      selectedRevision.files[0] ??
      null
    )
  }, [selectedRevision, selectedFileId])

  const versionHistoryCount = useMemo(() => {
    if (!doc) return 0
    return doc.revisions.length > 0
      ? doc.revisions.length
      : (doc.versions ?? []).filter((v: DocumentVersion) => v.mimeType !== 'image/png').length
  }, [doc])

  const totalAnnotationCount = useMemo(() => {
    if (!doc) return 0
    return doc.revisions.reduce((acc, rev) => {
      return acc + rev.files.reduce((fAcc, f) => fAcc + (f.annotations?.length ?? 0), 0)
    }, 0)
  }, [doc])

  // Annotation states
  const [isAnnotating, setIsAnnotating] = useState(false)
  type AnnotationTool = 'draw' | 'erase' | 'pan' | 'text'
  const [activeTool, setActiveTool] = useState<AnnotationTool>('draw')
  const [strokeColor, setStrokeColor] = useState('#ef4444') // Default red
  const [strokeWidth, setStrokeWidth] = useState(4)
  const canvasRef = useRef<ReactSketchCanvasRef>(null)

  // Dynamic circle cursor for draw/erase tools — scales with strokeWidth
  const circleCursor = useMemo(() => {
    const size = Math.max(8, (activeTool === 'erase' ? strokeWidth * 2 : strokeWidth) * 2 + 4)
    const radius = (size - 4) / 2
    const center = size / 2
    const color = activeTool === 'erase' ? '%23888888' : strokeColor.replace('#', '%23')
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><circle cx='${center}' cy='${center}' r='${radius}' fill='none' stroke='${color}' stroke-width='1.5'/><circle cx='${center}' cy='${center}' r='1' fill='${color}'/></svg>`
    return `url("data:image/svg+xml,${svg}") ${center} ${center}, crosshair`
  }, [strokeWidth, strokeColor, activeTool])

  const allAnnotations = useMemo(() => {
    if (!doc) return []
    const annotations: (DocumentFileAnnotation & { fileId: string; fileName: string })[] = []
    
    // Collect from all revisions
    doc.revisions.forEach(rev => {
      rev.files.forEach(file => {
        if (file.annotations) {
          file.annotations.forEach(ann => {
            annotations.push({ ...ann, fileId: file.id, fileName: file.fileName })
          })
        }
      })
    })

    // Legacy (pre multi-file revisions)
    if (doc.versions) {
      doc.versions.forEach(v => {
        // Versions didn't have nested annotations in the same way, 
        // but if they exist in state we should include them.
        // (Assuming version-based annotations use the same naming pattern if any)
      })
    }
    
    return annotations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [doc])

  const currentRevisionForAction = useMemo(() => {
    if (!doc) return null
    return doc.revisions.find(r => r.id === doc.currentRevisionId) ?? doc.revisions[0] ?? null
  }, [doc])

  const actionAnnotations = useMemo(() => {
    if (!currentRevisionForAction) return []
    const fileIds = new Set(currentRevisionForAction.files.map((f) => f.id))
    return allAnnotations.filter((ann) => fileIds.has(ann.fileId))
  }, [allAnnotations, currentRevisionForAction])

  // Textbox states
  const [zoomLevel, setZoomLevel] = useState(1)
  const [textboxes, setTextboxes] = useState<Textbox[]>([])
  const [selectedTextboxId, setSelectedTextboxId] = useState<string | null>(null)
  // Use refs for drag state to avoid re-render lag during rapid mouse movements
  const isDraggingRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const dragTargetIdRef = useRef<string | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const [isDraggingState, setIsDraggingState] = useState(false) // Only for cursor styling

  const handleWrapperClick = useCallback((e: React.MouseEvent) => {
    if (activeTool !== 'text' || !wrapperRef.current || isDraggingRef.current) return
    
    // Check if we clicked an existing textbox to avoid creating a new one
    if ((e.target as HTMLElement).closest('.annotation-textbox')) return

    const rect = wrapperRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / zoomLevel
    const y = (e.clientY - rect.top) / zoomLevel

    const newTextbox: Textbox = {
      id: uuidv4(),
      x,
      y,
      text: 'Type here...',
      color: strokeColor,
      fontSize: Math.max(12, strokeWidth * 4),
      isEditing: true
    }

    setTextboxes(prev => [...prev, newTextbox])
    setSelectedTextboxId(newTextbox.id)
  }, [activeTool, zoomLevel, strokeColor, strokeWidth])

  const startDrag = useCallback((clientX: number, clientY: number, id: string, currentTarget: HTMLElement) => {
    const textbox = textboxes.find(t => t.id === id)
    if (!textbox || textbox.isEditing) return
    if (activeTool === 'text') return

    isDraggingRef.current = true
    dragTargetIdRef.current = id
    setIsDraggingState(true)
    setSelectedTextboxId(id)

    const rect = currentTarget.getBoundingClientRect()
    dragOffsetRef.current = {
      x: (clientX - rect.left) / zoomLevel,
      y: (clientY - rect.top) / zoomLevel
    }
  }, [textboxes, activeTool, zoomLevel])

  const handleTextboxMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault()
    startDrag(e.clientX, e.clientY, id, e.currentTarget as HTMLElement)
  }, [startDrag])

  const handleTextboxTouchStart = useCallback((e: React.TouchEvent, id: string) => {
    if (e.touches.length !== 1) return
    const touch = e.touches[0]
    startDrag(touch.clientX, touch.clientY, id, e.currentTarget as HTMLElement)
  }, [startDrag])

  const moveDrag = useCallback((clientX: number, clientY: number) => {
    if (!isDraggingRef.current || !dragTargetIdRef.current || !wrapperRef.current) return

    const targetId = dragTargetIdRef.current
    const offset = dragOffsetRef.current
    const rect = wrapperRef.current.getBoundingClientRect()
    const x = (clientX - rect.left) / zoomLevel - offset.x
    const y = (clientY - rect.top) / zoomLevel - offset.y

    // Throttle updates with requestAnimationFrame
    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current)
    rafIdRef.current = requestAnimationFrame(() => {
      setTextboxes(prev => prev.map(t =>
        t.id === targetId ? { ...t, x, y } : t
      ))
      rafIdRef.current = null
    })
  }, [zoomLevel])

  const handleWrapperMouseMove = useCallback((e: React.MouseEvent) => {
    moveDrag(e.clientX, e.clientY)
  }, [moveDrag])

  const handleWrapperTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    const touch = e.touches[0]
    moveDrag(touch.clientX, touch.clientY)
  }, [moveDrag])

  const endDrag = useCallback(() => {
    isDraggingRef.current = false
    dragTargetIdRef.current = null
    setIsDraggingState(false)
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
  }, [])

  // Deselect textbox when clicking empty wrapper area (not on a textbox)
  const handleWrapperMouseDown = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'text') return
    if (!(e.target as HTMLElement).closest('.annotation-textbox')) {
      setSelectedTextboxId(null)
    }
  }, [activeTool])

  const updateTextbox = useCallback((id: string, updates: Partial<Textbox>) => {
    setTextboxes(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
  }, [])

  const removeTextbox = useCallback((id: string) => {
    setTextboxes(prev => prev.filter(t => t.id !== id))
    setSelectedTextboxId(prev => prev === id ? null : prev)
  }, [])

  // Handle textarea blur — keep editing if focus moved to toolbar within same textbox
  const handleTextareaBlur = useCallback((e: React.FocusEvent, id: string) => {
    const relatedTarget = e.relatedTarget as HTMLElement | null
    if (relatedTarget && (e.currentTarget as HTMLElement).closest('.annotation-textbox')?.contains(relatedTarget)) {
      return // Focus moved within the same textbox container (e.g. toolbar button)
    }
    updateTextbox(id, { isEditing: false })
  }, [updateTextbox])

  useEffect(() => {
    const renderDocx = async () => {
      if (
        previewUrl &&
        previewType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
        docxContainerRef.current
      ) {
        try {
          const response = await fetch(previewUrl)
          const arrayBuffer = await response.arrayBuffer()
          await renderAsync(arrayBuffer, docxContainerRef.current, undefined, {
            className: "docx",
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            ignoreFonts: false,
            breakPages: true,
            ignoreLastRenderedPageBreak: false,
            experimental: true,
            trimXmlDeclaration: true,
            useBase64URL: false,
            useMathMLPolyfill: true,
            showChanges: false,
            debug: false
          })
        } catch (err) {
          console.error('Docx render error:', err)
          sileo.error({ title: 'Preview rendering failed' })
        }
      }
    }

    renderDocx()
  }, [previewUrl, previewType, activeTab])

  const [completeComment, setCompleteComment] = useState('')
  const [isConfidentialComment, setIsConfidentialComment] = useState(false)
  const [confidentialComment, setConfidentialComment] = useState('')
  const [confidentialCommentVisibleTo, setConfidentialCommentVisibleTo] = useState<string[]>([])
  
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [annotationPreviews, setAnnotationPreviews] = useState<Record<string, string>>({})
  const [annotationBusy, setAnnotationBusy] = useState(false)
  const [showAnnotationsPanel, setShowAnnotationsPanel] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleEscape)
      return () => window.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen && documentId) {
      loadDocument()
      setActiveTab('details')
      setSelectedRevisionId(null)
      setSelectedFileId(null)
      setCompleteComment('')
      setUploadFiles([])
      setSubmitError('')
      if (previewUrl) {
        window.URL.revokeObjectURL(previewUrl)
        setPreviewUrl(null)
        setPreviewType(null)
      }
    }
  }, [isOpen, documentId])

  useEffect(() => {
    return () => {
      if (previewUrl) {
        window.URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  useEffect(() => {
    // Clear cached annotation object URLs when switching files
    Object.values(annotationPreviewUrlsRef.current).forEach((u) => window.URL.revokeObjectURL(u))
    annotationPreviewUrlsRef.current = {}
    setAnnotationPreviews({})
  }, [selectedFileId])

  const loadDocument = async () => {
    if (!documentId) return

    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to load document')
      }

      const data = await response.json()
      const nextDoc: DocumentData = data.document
      setDoc(nextDoc)

      // Initialize selection to the current revision + primary file (or first available)
      const initialRevision =
        nextDoc.revisions.find(r => r.id === nextDoc.currentRevisionId) ?? nextDoc.revisions[0] ?? null
      if (initialRevision) {
        setSelectedRevisionId(initialRevision.id)
        const primary = initialRevision.files.find(f => f.isPrimary) ?? initialRevision.files[0] ?? null
        setSelectedFileId(primary?.id ?? null)
      } else {
        setSelectedRevisionId(null)
        setSelectedFileId(null)
      }
    } catch (err) {
      setError('Failed to load document details')
      console.error('Failed to load document:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadCurrent = async () => {
    if (!documentId) return
    if (!doc) return

    try {
      const response = await fetch(`/api/documents/${documentId}/download-current`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to download file')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      const currentRevision =
        doc.revisions.find(r => r.id === doc.currentRevisionId) ?? doc.revisions[0] ?? null
      const primaryFile =
        currentRevision?.files.find(f => f.isPrimary) ?? currentRevision?.files[0] ?? null
      const legacyVersion =
        doc.versions?.find((v: DocumentVersion) => v.id === doc.currentVersionId) ?? doc.versions?.[0] ?? null
      a.download = primaryFile?.fileName || legacyVersion?.fileName || `document-${documentId}`
      window.document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      window.document.body.removeChild(a)
      sileo.success({ title: 'File downloaded successfully' })
    } catch (err) {
      console.error('Failed to download:', err)
      sileo.error({ title: 'Failed to download file' })
    }
  }

  const handleDownloadReference = async (refFileId: string, fileName: string) => {
    if (!documentId) return

    try {
      const response = await fetch(`/api/documents/${documentId}/download-reference/${refFileId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to download reference file')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      a.download = fileName || `reference-${documentId}`
      window.document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      window.document.body.removeChild(a)
      sileo.success({ title: 'Reference downloaded successfully' })
    } catch (err) {
      console.error('Failed to download reference:', err)
      sileo.error({ title: 'Failed to download reference file' })
    }
  }

  const handlePreview = async (fileId?: string) => {
    if (!documentId) return
    const targetFileId = fileId || selectedFile?.id || null

    setPreviewLoading(true)
    try {
      const getExt = (name: string): string => {
        const idx = name.lastIndexOf('.')
        if (idx === -1) return ''
        return name.slice(idx + 1).toLowerCase()
      }

      const findFileMetaById = (id: string): { fileName: string; mimeType: string } | null => {
        if (!doc) return null
        for (const rev of doc.revisions ?? []) {
          const f = rev.files.find((x) => x.id === id)
          if (f) return { fileName: f.fileName, mimeType: f.mimeType }
        }
        return null
      }

      const fileMeta = targetFileId ? findFileMetaById(targetFileId) : null
      const effectiveFileName = fileMeta?.fileName ?? selectedFile?.fileName ?? ''
      const effectiveExt = getExt(effectiveFileName)
      const isOfficePreview = effectiveExt === 'ppt' || effectiveExt === 'pptx' || effectiveExt === 'xls' || effectiveExt === 'xlsx'

      if (isAnnotating) {
        setIsAnnotating(false)
        setTextboxes([])
        setSelectedTextboxId(null)
        void canvasRef.current?.clearCanvas()
      }

      if (isOfficePreview && targetFileId) {
        const infoRes = await fetch(`/api/documents/${documentId}/preview-info/${targetFileId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const infoPayload = await infoRes.json().catch(() => ({}))
        if (!infoRes.ok) {
          throw new Error(infoPayload?.error || 'Failed to load preview info')
        }

        const pages = Number(infoPayload?.pages)
        if (!Number.isFinite(pages) || pages <= 0) {
          throw new Error('Invalid preview info')
        }

        const imgRes = await fetch(`/api/documents/${documentId}/preview-image/${targetFileId}?page=1`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!imgRes.ok) {
          const imgPayload = await imgRes.json().catch(() => ({}))
          throw new Error(imgPayload?.error || 'Failed to load preview image')
        }

        const blob = await imgRes.blob()

        if (previewUrl) {
          window.URL.revokeObjectURL(previewUrl)
        }

        const url = window.URL.createObjectURL(blob)
        setPreviewUrl(url)
        setPreviewType(blob.type || 'image/png')
        setPaginatedPreview({ fileId: targetFileId, page: 1, pages })
        setActiveTab('preview')
        return
      }

      setPaginatedPreview(null)

      const endpoint = targetFileId
        ? `/api/documents/${documentId}/download/${targetFileId}`
        : `/api/documents/${documentId}/download-current`

      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to load preview file')
      }

      const blob = await response.blob()

      if (previewUrl) {
        window.URL.revokeObjectURL(previewUrl)
      }

      const url = window.URL.createObjectURL(blob)
      setPreviewUrl(url)
      setPreviewType(blob.type)
      setActiveTab('preview')
    } catch (err: any) {
      console.error('Failed to load preview:', err)
      sileo.error({ title: 'Failed to load document preview' })
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleChangePaginatedPreviewPage = async (nextPage: number) => {
    if (!documentId || !paginatedPreview) return
    if (nextPage < 1 || nextPage > paginatedPreview.pages) return

    try {
      setPreviewLoading(true)

      if (isAnnotating) {
        setIsAnnotating(false)
        setTextboxes([])
        setSelectedTextboxId(null)
        void canvasRef.current?.clearCanvas()
      }

      const imgRes = await fetch(
        `/api/documents/${documentId}/preview-image/${paginatedPreview.fileId}?page=${nextPage}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!imgRes.ok) {
        const imgPayload = await imgRes.json().catch(() => ({}))
        throw new Error(imgPayload?.error || 'Failed to load preview image')
      }
      const blob = await imgRes.blob()

      if (previewUrl) {
        window.URL.revokeObjectURL(previewUrl)
      }
      const url = window.URL.createObjectURL(blob)
      setPreviewUrl(url)
      setPreviewType(blob.type || 'image/png')
      setPaginatedPreview({ ...paginatedPreview, page: nextPage })
    } catch (err) {
      console.error('Failed to change preview page:', err)
      sileo.error({ title: 'Failed to change preview page' })
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleSaveAnnotation = async () => {
    if (!wrapperRef.current || !documentId || !selectedFile) return
    try {
      setAnnotationBusy(true)
      
      const dataUri = await toPng(wrapperRef.current, {
        pixelRatio: 2, // For better resolution/text clarity
        backgroundColor: '#ffffff', // Explicitly set background so it isn't transparent
      })
      
      // convert base64 to Blob
      const byteString = atob(dataUri.split(',')[1])
      const mimeString = dataUri.split(',')[0].split(':')[1].split(';')[0]
      const ab = new ArrayBuffer(byteString.length)
      const ia = new Uint8Array(ab)
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i)
      }
      const blob = new Blob([ab], { type: mimeString })
      const file = new File([blob], `annotated-${documentId}.png`, { type: mimeString })

      const fd = new FormData()
      fd.append('file', file)
      fd.append('pageNumber', (paginatedPreview?.fileId === selectedFile.id ? paginatedPreview?.page : 1).toString())

      const res = await fetch(`/api/documents/${documentId}/files/${selectedFile.id}/annotations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })

      const payload = await res.json()
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to attach annotation')
      }

      setIsAnnotating(false)
      setTextboxes([])
      setSelectedTextboxId(null)
      await loadDocument()
      sileo.success({ title: 'Annotation attached' })
    } catch (e) {
      console.error('Error saving annotation:', e)
      sileo.error({ title: 'Failed to attach annotation' })
    } finally {
      setAnnotationBusy(false)
    }
  }


  const ensureAnnotationPreview = useCallback(
    async (annotationId: string, fileId: string) => {
      if (!documentId) return
      if (annotationPreviewUrlsRef.current[annotationId]) return

      try {
        const res = await fetch(
          `/api/documents/${documentId}/files/${fileId}/annotations/${annotationId}/download`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (!res.ok) return
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        annotationPreviewUrlsRef.current[annotationId] = url
        setAnnotationPreviews((prev) => ({ ...prev, [annotationId]: url }))
      } catch (e) {
        console.error('Failed to fetch annotation preview:', e)
      }
    },
    [documentId, token]
  )

  useEffect(() => {
    if (!showAnnotationsPanel) return
    if (allAnnotations.length === 0) return
    // Prefetch a few thumbnails for better perceived performance.
    allAnnotations.slice(0, 8).forEach((a) => {
      void ensureAnnotationPreview(a.id, a.fileId)
    })
  }, [showAnnotationsPanel, allAnnotations, ensureAnnotationPreview])

  useEffect(() => {
    if (activeTab !== 'complete') return
    if (actionAnnotations.length === 0) return
    actionAnnotations.forEach((a) => {
      void ensureAnnotationPreview(a.id, a.fileId)
    })
  }, [activeTab, actionAnnotations, ensureAnnotationPreview])

  const handleDownloadAnnotation = useCallback(
    async (annotationId: string, fileId: string, fileName: string) => {
      if (!documentId) return
      try {
        const res = await fetch(
          `/api/documents/${documentId}/files/${fileId}/annotations/${annotationId}/download`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (!res.ok) throw new Error('Failed to download annotation')
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = window.document.createElement('a')
        a.href = url
        a.download = fileName || `annotation-${annotationId}.png`
        window.document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        window.document.body.removeChild(a)
      } catch (e) {
        console.error('Failed to download annotation:', e)
        sileo.error({ title: 'Failed to download annotation' })
      }
    },
    [documentId, token]
  )

  const handleDeleteAnnotation = useCallback(
    async (annotationId: string, fileId: string) => {
      if (!documentId) return
      try {
        setAnnotationBusy(true)
        const res = await fetch(
          `/api/documents/${documentId}/files/${fileId}/annotations/${annotationId}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
        )
        const payload = await res.json()
        if (!res.ok) throw new Error(payload?.error || 'Failed to delete annotation')

        const url = annotationPreviewUrlsRef.current[annotationId]
        if (url) window.URL.revokeObjectURL(url)
        delete annotationPreviewUrlsRef.current[annotationId]
        setAnnotationPreviews((prev) => {
          const { [annotationId]: _, ...rest } = prev
          return rest
        })

        await loadDocument()
        sileo.success({ title: 'Annotation deleted' })
      } catch (e) {
        console.error('Failed to delete annotation:', e)
        sileo.error({ title: 'Failed to delete annotation' })
      } finally {
        setAnnotationBusy(false)
      }
    },
    [documentId, token]
  )

  const handleDownloadVersion = async (versionId: string, fileName: string) => {
    try {
      const response = await fetch(`/api/documents/${documentId}/download/${versionId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to download file')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      sileo.success({ title: 'File downloaded successfully' })
    } catch (err) {
      console.error('Failed to download:', err)
      sileo.error({ title: 'Failed to download file' })
    }
  }

  const handleCompleteStep = async (actionType: 'complete-step' | 'disapprove-step' = 'complete-step') => {
    setSubmitError('')

    // Comment is optional for regular DRAFTER steps, required for APPROVER steps, disapproval, or resolving CHANGES_REQUESTED
    const isCommentRequired =
      actionType === 'disapprove-step' ||
      currentWorkflowStep?.role === 'APPROVER' ||
      (currentWorkflowStep?.role === 'DRAFTER' && doc?.currentStatus === 'CHANGES_REQUESTED') ||
      (currentWorkflowStep?.role === 'DRAFTER' && user?.role === 'EDITOR')
    if (isCommentRequired && !completeComment.trim()) {
      setSubmitError('Please add a comment')
      return
    }

    if (actionType === 'complete-step' && isCurrentStepRequiringFile && uploadFiles.length === 0) {
      const roleName = 'draft'
      setSubmitError(`Document upload is required to submit ${roleName}`)
      return
    }

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('action', actionType)
      formData.append('comment', completeComment)
      if (isConfidentialComment && confidentialComment.trim() !== '') {
        formData.append('confidentialComment', confidentialComment)
        if (confidentialCommentVisibleTo.length > 0) {
          formData.append('confidentialCommentVisibleTo', JSON.stringify(confidentialCommentVisibleTo))
        }
      }
      if (uploadFiles.length > 0) {
        uploadFiles.forEach((f) => formData.append('files', f))
      }

      const response = await fetch(`/api/documents/${documentId}/complete-step`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to complete step')
      }

      window.dispatchEvent(new Event('documentStepCompleted'))

      await loadDocument()
      setActiveTab('workflow')
      setCompleteComment('')
      setIsConfidentialComment(false)
      setConfidentialComment('')
      setConfidentialCommentVisibleTo([])
      setUploadFiles([])
      sileo.success({ title: actionType === 'disapprove-step' ? 'Document disapproved' : 'Step completed successfully' })
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to complete step')
      sileo.error({ title: err.message || 'Failed to complete step' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteDocument = async () => {
    if (!documentId) return

    setIsDeleting(true)
    setError('')
    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete document')
      }

      window.dispatchEvent(new Event('documentDeleted'))
      setShowDeleteConfirm(false)
      onClose()
      sileo.success({ title: 'Document deleted successfully' })
    } catch (err: any) {
      setError(err.message || 'Failed to delete document')
      console.error('Failed to delete document:', err)
      sileo.error({ title: err.message || 'Failed to delete document' })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCancelDocument = async () => {
    if (!documentId) return

    setIsCancelling(true)
    setError('')
    try {
      const response = await fetch(`/api/documents/${documentId}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to cancel document')
      }

      window.dispatchEvent(new Event('documentDeleted'))
      setShowCancelConfirm(false)
      onClose()
      sileo.success({ title: 'Document cancelled and deleted successfully' })
    } catch (err: any) {
      setError(err.message || 'Failed to cancel document')
      console.error('Failed to cancel document:', err)
      sileo.error({ title: err.message || 'Failed to cancel document' })
    } finally {
      setIsCancelling(false)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setUploadFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)])
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files
    if (picked && picked.length > 0) {
      setUploadFiles(prev => [...prev, ...Array.from(picked)])
    }
  }

  const handleUploadFileRemove = (index: number) => {
    setUploadFiles(prev => prev.filter((_, i) => i !== index))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'TOP_SECRET':
        return 'bg-red-100 text-red-800'
      case 'SECRET':
        return 'bg-orange-100 text-orange-800'
      case 'CONFIDENTIAL':
        return 'bg-green-100 text-green-800'
      case 'RESTRICTED':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStepStatusColor = (status: string, overrideDisapproved: boolean = false) => {
    if (overrideDisapproved) return 'bg-red-100 text-red-700'
    switch (status) {
      case 'PENDING':
        return 'bg-gray-100 text-gray-700'
      case 'IN_PROGRESS':
        return 'bg-blue-100 text-blue-700'
      case 'COMPLETED':
        return 'bg-green-100 text-green-700'
      case 'SKIPPED':
        return 'bg-gray-100 text-gray-500'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  const renderCommentWithLinks = (commentStr: string) => {
    const parts = commentStr.split(/(\[.*?\]\(.*?\))/g);
    return parts.map((part, i) => {
      const match = part.match(/\[(.*?)\]\((.*?)\)/);
      if (match) {
          const url = match[2];
          // Check if it's the specific annotation download URL format: /api/documents/{id}/download/{versionId}
          const downloadMatch = url.match(/\/api\/documents\/[^\/]+\/download\/([^\/]+)$/);
          
          if (downloadMatch) {
            const versionId = downloadMatch[1];
            return (
              <button 
                key={i} 
                onClick={(e) => {
                  e.preventDefault();
                  handleDownloadVersion(versionId, `annotation-${versionId}.png`);
                }}
                className="text-indigo-600 hover:text-indigo-800 underline font-medium mx-1 flex items-center inline-flex bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 not-italic cursor-pointer"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                {match[1]}
              </button>
            );
          }

          // Fallback for standard links
          return (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 underline font-medium mx-1 flex items-center inline-flex bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 not-italic">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              {match[1]}
            </a>
          );
      }
      return <span key={i}>{part}</span>;
    });
  }

  const currentWorkflowStep = doc?.workflowInstances?.[0]?.steps.find(
    (step: any) => step.stepOrder === doc.workflowInstances[0].currentStep
  )

  const canCompleteStep = user?.role === 'ADMIN' || (
    (
      currentWorkflowStep?.role === user?.role ||
      (currentWorkflowStep?.role === 'DRAFTER' && (user?.role === 'DRAFTER' || user?.role === 'EDITOR'))
    ) &&
    (!currentWorkflowStep?.department?.id || user?.departmentIds?.includes(currentWorkflowStep.department.id))
  )

  const isCurrentStepDrafter = currentWorkflowStep?.role === 'DRAFTER'
  const isCurrentStepRequiringFile = isCurrentStepDrafter
  const isCommentRequired =
    currentWorkflowStep?.role === 'APPROVER' ||
    (isCurrentStepDrafter && doc?.currentStatus === 'CHANGES_REQUESTED') ||
    (isCurrentStepDrafter && user?.role === 'EDITOR')
  const showDisapproveOption = currentWorkflowStep?.role === 'APPROVER'

  const isDocumentComplete = doc?.currentStatus === 'APPROVED' || doc?.currentStatus === 'FINAL'

  const workflowStepsForCancel = doc?.workflowInstances?.[0]?.steps.map((step: WorkflowStep) => ({
    role: step.role,
    status: step.status
  })) || []

  const canCancel = canUserCancelDocument(
    doc?.currentStatus || '',
    doc?.createdBy?.id || '',
    user?.id || '',
    user?.role || '',
    workflowStepsForCancel
  )

  const uniquePersonnel = Array.from(new Map(
    doc?.workflowInstances.flatMap(wi => wi.steps.flatMap(step => {
      const users: any[] = []
      if (step.assignedTo) users.push(step.assignedTo)
      if (step.completedBy) users.push(step.completedBy)
      if (step.department?.users) {
        step.department.users.forEach((u: any) => {
          users.push({ id: u.id, name: `${u.name} (${step.department?.name || ''})` })
        })
      }
      return users
    })).concat(doc?.createdBy ? [{ id: doc.createdBy.id, name: `${doc.createdBy.name} (Author)` }] : []).map(u => [u.id, u])
  ).values())

  if (!isOpen) return null

  return (
    <>
    <div
      className="fixed inset-0 backdrop-blur-sm overflow-y-auto h-full w-full z-50"
      onClick={onClose}
    >
      <div className={`relative top-4 md:top-10 mx-auto p-4 md:p-5 border w-[96%] sm:w-11/12 ${activeTab === 'preview' ? 'max-w-7xl' : 'max-w-5xl'} shadow-xl rounded-xl bg-white mb-20`} onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col sm:flex-row justify-between items-start mb-4 md:mb-6 gap-3">
            <div className="pr-8 sm:pr-0">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 leading-tight">Document Details</h2>
              {doc && (
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{doc.title}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="absolute top-4 right-4 sm:relative sm:top-auto sm:right-auto text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-md transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-800 p-4 rounded-md text-center">
            {error}
          </div>
        ) : doc ? (
          <div className="space-y-4 md:space-y-6">
            <div className="border-b border-gray-200">
              <nav className="flex overflow-x-auto space-x-4 md:space-x-8 -mb-px pb-1 scrollbar-hide">
                <button
                  onClick={() => setActiveTab('details')}
                  className={`whitespace-nowrap py-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'details'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Details
                </button>
                <button
                  onClick={() => setActiveTab('workflow')}
                  className={`py-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'workflow'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Workflow Timeline
                </button>
                <button
                  onClick={() => setActiveTab('versions')}
                  className={`py-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'versions'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Version History ({doc.revisions.length > 0 ? doc.revisions.length : (doc.versions ?? []).filter((v: DocumentVersion) => v.mimeType !== 'image/png').length})
                </button>
                {(previewUrl || previewLoading) && (
                  <button
                    onClick={() => setActiveTab('preview')}
                    className={`py-2 px-1 text-sm font-medium border-b-2 transition-colors flex items-center ${
                      activeTab === 'preview'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {previewLoading ? (
                      <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                    Preview
                  </button>
                )}
                {canCompleteStep && !isDocumentComplete && (
                  <button
                    onClick={() => setActiveTab('complete')}
                    className={`py-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'complete'
                        ? 'border-green-500 text-green-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Action Required
                  </button>
                )}
              </nav>
            </div>

            {activeTab === 'details' && (
              <div className="space-y-4 md:space-y-6">
                <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-4 md:p-6 text-white">
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                    <div className="w-full sm:w-auto">
                      <h3 className="text-xl md:text-2xl font-bold mb-2 break-words">{doc.title}</h3>
                      <p className="text-indigo-100 text-sm flex flex-wrap gap-2 items-center">
                        <span className="inline-flex items-center whitespace-nowrap">
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                          {doc.type}
                        </span>
                        <span className="hidden sm:inline mx-1">•</span>
                        <span className="inline-flex items-center whitespace-nowrap">
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {format(new Date(doc.createdAt), 'MMM dd, yyyy')}
                        </span>
                      </p>
                    </div>
                    <span className={`inline-flex whitespace-nowrap px-3 py-1.5 md:px-4 md:py-2 flex-shrink-0 text-xs md:text-sm font-bold rounded-full shadow-lg ${getStatusColor(doc.currentStatus)}`}>
                      {getStatusLabel(doc.currentStatus)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg ${getPriorityColor(doc.priority).split(' ')[0]}`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Classification</p>
                        <p className="font-semibold text-gray-900">{doc.priority}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Type of Compliance</p>
                        <p className="font-semibold text-gray-900">{getComplianceTypeLabel(doc.complianceType)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Versions</p>
                        <p className="font-semibold text-gray-900">
                          {doc.revisions.length > 0
                            ? doc.revisions.length
                            : (doc.versions ?? []).filter((v: DocumentVersion) => v.mimeType !== 'image/png').length}
                        </p>
                      </div>
                    </div>
                  </div>

                  {doc.deadline ? (
                    <div className={`border rounded-lg p-4 hover:shadow-md transition-shadow ${new Date(doc.deadline) < new Date() ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}>
                      <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg ${new Date(doc.deadline) < new Date() ? 'bg-red-200 text-red-700' : 'bg-orange-200 text-orange-700'}`}>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <p className={`text-xs uppercase tracking-wide font-semibold ${new Date(doc.deadline) < new Date() ? 'text-red-700' : 'text-orange-700'}`}>Deadline</p>
                          <p className={`font-bold ${new Date(doc.deadline) < new Date() ? 'text-red-700' : 'text-orange-700'}`}>
                            {format(new Date(doc.deadline), 'MMM dd, yyyy HH:mm')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 rounded-lg bg-gray-200 text-gray-500">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Deadline</p>
                          <p className="font-semibold text-gray-400">Not set</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-200 pt-6">
                  <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Document Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Created By</p>
                      </div>
                      <p className="font-semibold text-gray-900">{doc.createdBy.name}</p>
                      <p className="text-xs text-gray-500 capitalize mb-1">{doc.createdBy.role === 'DRAFTER' ? 'Drafter/Editor' : doc.createdBy.role.toLowerCase()}</p>
                      {doc.createdBy.phoneNumber && (
                        <div className="flex items-center gap-1.5 mt-2 bg-gray-100 text-gray-600 px-2 py-1 rounded-md text-xs font-medium w-fit shadow-sm">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                          {doc.createdBy.phoneNumber}
                        </div>
                      )}
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Department</p>
                      </div>
                       <p className="font-semibold text-gray-900">{doc.departments.length > 0 ? doc.departments.map(d => d.department.name).join(', ') : 'All Departments'}</p>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Created</p>
                      </div>
                      <p className="font-semibold text-gray-900">{format(new Date(doc.createdAt), 'MMM dd, yyyy')}</p>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">Last Updated</p>
                      </div>
                      <p className="font-semibold text-gray-900">{format(new Date(doc.updatedAt), 'MMM dd, yyyy HH:mm')}</p>
                    </div>
                  </div>
                </div>

                {doc.referenceFiles && doc.referenceFiles.length > 0 && (
                  <div className="border-t border-gray-200 pt-4 md:pt-6">
                    <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3 md:mb-4">
                      Reference Documents ({doc.referenceFiles.length})
                    </h4>
                    <div className="space-y-2">
                      {doc.referenceFiles.map((refFile) => (
                        <div key={refFile.id} className="bg-white border border-gray-200 rounded-lg p-3 md:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center space-x-3 md:space-x-4 min-w-0 flex-1">
                            <div className="p-2 md:p-3 bg-indigo-50 text-indigo-600 rounded-lg flex-shrink-0">
                              <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                              </svg>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{refFile.fileName}</p>
                              <p className="text-xs text-gray-500">{formatFileSize(refFile.fileSize)}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDownloadReference(refFile.id, refFile.fileName)}
                            className="w-full sm:w-auto px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-sm flex-shrink-0"
                          >
                            Download
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row justify-end pt-4 border-t border-gray-200 gap-3 sm:gap-0 sm:space-x-3">
                  {canCompleteStep && !isDocumentComplete && (
                    <button
                      onClick={() => setActiveTab('complete')}
                      className="inline-flex w-full sm:w-auto justify-center items-center px-4 md:px-6 py-2 md:py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-medium shadow-lg hover:shadow-xl"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Complete Step
                    </button>
                  )}
                  {(doc.currentRevisionId || doc.currentVersionId) && (
                    <>
                      <button
                        onClick={() => handlePreview()}
                        className="inline-flex w-full sm:w-auto justify-center items-center px-4 md:px-6 py-2 md:py-3 bg-white text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-all font-medium shadow hover:shadow-md"
                      >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Preview Document
                      </button>
                      <button
                        onClick={handleDownloadCurrent}
                        className="inline-flex w-full sm:w-auto justify-center items-center px-4 md:px-6 py-2 md:py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-medium shadow-lg hover:shadow-xl"
                      >
                        <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download Current Version
                      </button>
                    </>
                  )}
                  {canCancel && (
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      className="inline-flex w-full sm:w-auto justify-center items-center px-4 md:px-6 py-2 md:py-3 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition-all font-medium shadow-lg hover:shadow-xl"
                    >
                      <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Cancel Submission
                    </button>
                  )}
                  {user?.role === 'ADMIN' && (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={isDeleting}
                      className="inline-flex w-full sm:w-auto justify-center items-center px-4 md:px-6 py-2 md:py-3 bg-red-60 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-all font-medium shadow-lg hover:shadow-xl disabled:opacity-50"
                    >
                      <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete Document
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'workflow' && doc.workflowInstances.length > 0 && (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-3 md:p-4">
                  {doc.workflowInstances[0].steps.map((step: WorkflowStep) => (
                    <div key={step.id} className={`flex items-start space-x-3 md:space-x-4 py-4 ${step.stepOrder < doc.workflowInstances[0].currentStep ? 'opacity-60' : ''}`}>
                      <div className={`flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-xs md:text-sm font-semibold ${getStepStatusColor(step.status, step.comment?.startsWith('[DISAPPROVED]'))} ${step.stepOrder === doc.workflowInstances[0].currentStep ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}>
                        {step.stepOrder}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900">
                            {step.department?.name || 'General'} - {step.role === 'DRAFTER' ? 'Drafter/Editor' : step.role.toLowerCase()}
                          </p>
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${getStepStatusColor(step.status, step.comment?.startsWith('[DISAPPROVED]'))}`}>
                            {step.comment?.startsWith('[DISAPPROVED]') ? 'disapproved' : step.status.replace('_', ' ').toLowerCase()}
                          </span>
                          {step.stepOrder === doc.workflowInstances[0].currentStep && (
                            <div className="flex items-center gap-2 ml-auto sm:ml-0">
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700">
                                Current
                              </span>
                              {canCompleteStep && (
                                <button
                                  onClick={() => setActiveTab('complete')}
                                  className="text-xs font-bold text-green-600 hover:text-green-700 underline"
                                >
                                  Take Action
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-gray-600">
                          <div className="flex items-center gap-1 flex-wrap">
                            {step.assignedTo ? (
                              <>
                                <span>Assigned to: {step.assignedTo.name}</span>
                                {step.assignedTo.phoneNumber && (
                                  <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                    {step.assignedTo.phoneNumber}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span>All {step.role === 'DRAFTER' ? 'Drafter/Editors' : step.role.toLowerCase() + 's'} in {step.department?.name || 'General'}</span>
                            )}
                          </div>
                          {step.completedBy && (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span>Completed by: {step.completedBy.name} ({step.completedBy.role === 'DRAFTER' ? 'Drafter/Editor' : step.completedBy.role.toLowerCase()})</span>
                              {step.completedBy.phoneNumber && (
                                <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                  {step.completedBy.phoneNumber}
                                </span>
                              )}
                            </div>
                          )}
                          {step.completedAt && (
                            <p>Completed: {format(new Date(step.completedAt), 'MMM dd, yyyy HH:mm')}</p>
                          )}
                        </div>
                        {step.comment && (
                          <p className={`text-sm mt-2 p-3 rounded-lg italic whitespace-pre-wrap border ${step.comment.startsWith('[DISAPPROVED]') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white text-gray-700 border-gray-200'}`}>
                            "{renderCommentWithLinks(step.comment.startsWith('[DISAPPROVED]') ? step.comment.replace('[DISAPPROVED]', '').trim() : step.comment)}"
                          </p>
                        )}
                        {step.confidentialComment && (
                          <div className="mt-3 p-3 rounded-lg border bg-yellow-50 border-yellow-200 text-yellow-800 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-16 h-16 transform translate-x-8 -translate-y-8 bg-yellow-200 rounded-full opacity-50"></div>
                            <div className="relative z-10">
                              <div className="flex items-center space-x-2 mb-2">
                                <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                <span className="text-xs font-bold uppercase tracking-wider text-yellow-700">Confidential Comment</span>
                              </div>
                              <p className="text-sm italic whitespace-pre-wrap">
                                "{renderCommentWithLinks(step.confidentialComment)}"
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Annotations for this step */}
                        {(() => {
                          const stepAnns = allAnnotations.filter(a => a.workflowStepId === step.id)
                          if (stepAnns.length === 0) return null
                          return (
                            <div className="mt-3 space-y-2">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Attached Annotations</p>
                              <div className="flex flex-wrap gap-2">
                                {stepAnns.map(ann => (
                                  <button
                                    key={ann.id}
                                    type="button"
                                    onClick={() => handleDownloadAnnotation(ann.id, ann.fileId, ann.fileName)}
                                    className="group relative w-16 h-16 bg-gray-100 border border-gray-200 rounded overflow-hidden hover:border-indigo-300 transition-colors shadow-sm"
                                    title={`Download: ${ann.fileName} (Page ${ann.pageNumber})`}
                                  >
                                    {annotationPreviews[ann.id] ? (
                                      <img src={annotationPreviews[ann.id]} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center bg-gray-50">
                                        <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                      </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                      <div className="bg-white/90 rounded px-1 py-0.5 text-[8px] font-bold text-gray-900 border border-gray-200 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                        P{ann.pageNumber}
                                      </div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'preview' && previewUrl && (
              <div className="bg-gray-50 rounded-lg overflow-hidden border border-gray-200 h-[85vh] flex flex-col">
                <div className="p-3 bg-white border-b border-gray-200 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis">
                      Document Preview &middot; {previewType}
                    </div>
                    {selectedFile?.fileName && (
                      <div className="text-xs text-gray-500 truncate">
                        {selectedFile.fileName}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 md:gap-3 justify-end">
                    {doc.revisions.length > 0 && (
                      <>
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Revision</label>
                          <select
                            value={selectedRevision?.id ?? ''}
                            onChange={(e) => {
                              const revId = e.target.value
                              setSelectedRevisionId(revId)
                              const rev = doc.revisions.find((r) => r.id === revId) ?? null
                              const primary = rev?.files.find((f) => f.isPrimary) ?? rev?.files[0] ?? null
                              setSelectedFileId(primary?.id ?? null)
                              if (primary) void handlePreview(primary.id)
                            }}
                            className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white text-gray-900"
                          >
                            {doc.revisions.map((r) => (
                              <option key={r.id} value={r.id} className="text-gray-900">
                                Rev {r.revisionNumber}{r.id === doc.currentRevisionId ? ' (Current)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">File</label>
                          <select
                            value={selectedFile?.id ?? ''}
                            onChange={(e) => {
                              const fileId = e.target.value
                              setSelectedFileId(fileId)
                              void handlePreview(fileId)
                            }}
                            className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white max-w-[16rem] text-gray-900"
                          >
                            {(selectedRevision?.files ?? []).map((f) => (
                              <option key={f.id} value={f.id} className="text-gray-900">
                                {f.isPrimary ? '[Primary] ' : ''}{f.fileName}
                              </option>
                            ))}
                          </select>
                        </div>

                        {paginatedPreview && (
                          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-2 py-1">
                            <button
                              type="button"
                              onClick={() => void handleChangePaginatedPreviewPage(paginatedPreview.page - 1)}
                              disabled={previewLoading || paginatedPreview.page <= 1}
                              className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-white"
                            >
                              Prev
                            </button>
                            <span className="text-xs text-gray-700 tabular-nums">
                              Page {paginatedPreview.page} / {paginatedPreview.pages}
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleChangePaginatedPreviewPage(paginatedPreview.page + 1)}
                              disabled={previewLoading || paginatedPreview.page >= paginatedPreview.pages}
                              className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-white"
                            >
                              Next
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowAnnotationsPanel((v) => !v)}
                      className={`text-sm px-3 py-1.5 rounded-md font-medium border transition-colors ${
                        showAnnotationsPanel ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                      title="View document wide annotations"
                    >
                      Annotations ({allAnnotations.length})
                    </button>

                    {(previewType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || previewType?.startsWith('image/')) && canCompleteStep && (
                      <button
                        onClick={() => {
                          const newState = !isAnnotating
                          setIsAnnotating(newState)
                          if (!newState) {
                            setActiveTool('draw')
                            setZoomLevel(1)
                          }
                        }}
                        className={`text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${
                          isAnnotating ? 'bg-indigo-600 text-white shadow-sm' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                        }`}
                      >
                        {isAnnotating ? 'Exit Annotation' : 'Draw Annotation'}
                      </button>
                    )}

                    <button
                      onClick={() => setActiveTab('details')}
                      className="text-sm text-gray-600 hover:text-gray-900"
                    >
                      Close Preview
                    </button>
                  </div>
                </div>

                {/* Annotation Toolbar */}
                {isAnnotating && (
                  <div className="bg-indigo-50 border-b border-indigo-100 p-2 flex flex-col md:flex-row items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex bg-indigo-50 p-1 rounded-lg border border-indigo-100 shadow-sm">
                        <button
                          onClick={() => { setActiveTool('draw'); canvasRef.current?.eraseMode(false) }}
                          className={`p-2 rounded ${activeTool === 'draw' ? 'bg-indigo-200 text-indigo-800' : 'text-gray-600 hover:bg-indigo-100'}`}
                          title="Draw"
                        >
                          <Pen className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => { setActiveTool('erase'); canvasRef.current?.eraseMode(true) }}
                          className={`p-2 rounded ${activeTool === 'erase' ? 'bg-indigo-200 text-indigo-800' : 'text-gray-600 hover:bg-indigo-100'}`}
                          title="Erase"
                        >
                          <Eraser className="w-5 h-5" />
                        </button>
                        <div className="h-6 w-px bg-indigo-200 mx-1"></div>
                        <button
                          onClick={() => { setActiveTool('pan'); canvasRef.current?.eraseMode(false) }}
                          className={`p-2 rounded flex items-center space-x-1 ${activeTool === 'pan' ? 'bg-indigo-200 text-indigo-800' : 'text-gray-600 hover:bg-indigo-100'}`}
                          title="Pan/Scroll"
                        >
                          <Hand className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => { setActiveTool('text'); canvasRef.current?.eraseMode(false) }}
                          className={`p-2 rounded ${activeTool === 'text' ? 'bg-indigo-200 text-indigo-800' : 'text-gray-600 hover:bg-indigo-100'}`}
                          title="Text"
                        >
                          <Type className="w-5 h-5" />
                        </button>
                      </div>
                      
                      <div className="h-6 w-px bg-indigo-200 mx-2"></div>
                      
                      <div className="flex items-center space-x-2">
                        <label className="text-xs font-medium text-indigo-900">Color:</label>
                        <input 
                          type="color" 
                          value={strokeColor} 
                          onChange={(e) => setStrokeColor(e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                          disabled={activeTool === 'erase'}
                        />
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <label className="text-xs font-medium text-indigo-900">px: {strokeWidth}</label>
                        <input 
                          type="range" 
                          min="1" max="20" 
                          value={strokeWidth} 
                          onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
                          className="w-24"
                        />
                      </div>
                      
                      <div className="flex items-center space-x-2 md:hidden bg-white px-2 py-1 rounded border border-indigo-200 shadow-sm">
                        <label className="text-xs font-bold text-indigo-900 mr-1">Zoom:</label>
                        <button onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))} className="w-6 h-6 flex items-center justify-center rounded bg-indigo-100 text-indigo-800 hover:bg-indigo-200 font-bold">-</button>
                        <span className="text-xs font-medium w-8 text-center">{Math.round(zoomLevel * 100)}%</span>
                        <button onClick={() => setZoomLevel(z => Math.min(3, z + 0.25))} className="w-6 h-6 flex items-center justify-center rounded bg-indigo-100 text-indigo-800 hover:bg-indigo-200 font-bold">+</button>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2 md:space-x-3 w-full md:w-auto justify-end">
                      <button onClick={() => canvasRef.current?.undo()} className="text-sm px-3 py-1.5 text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 rounded flex-1 md:flex-none">Undo</button>
                      <button onClick={() => canvasRef.current?.clearCanvas()} className="text-sm px-3 py-1.5 text-red-600 bg-white border border-red-200 hover:bg-red-50 rounded flex-1 md:flex-none">Clear</button>
                      <button 
                        onClick={handleSaveAnnotation} 
                        disabled={annotationBusy}
                        className="text-sm px-4 py-1.5 text-white bg-indigo-600 hover:bg-indigo-700 rounded shadow-sm font-medium flex items-center justify-center w-full md:w-auto mt-2 md:mt-0"
                      >
                        {annotationBusy ? 'Saving...' : 'Attach Annotation'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex-1 w-full flex items-center justify-center bg-gray-100 overflow-auto relative">
                  {previewType === 'application/pdf' ? (
                    <object data={previewUrl} type="application/pdf" className="w-full h-full shadow-sm">
                      <iframe src={previewUrl} className="w-full h-full border-0">
                        <p>This browser does not support PDFs. Please download the PDF to view it.</p>
                      </iframe>
                    </object>
                  ) : (previewType?.startsWith('image/') || previewType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') ? (
                    <div style={{ position: 'relative', width: '100%', height: '100%', border: '1px solid #ddd', backgroundColor: '#f3f4f6', overflowY: 'auto', overflowX: 'auto' }}>
                      <div 
                        ref={wrapperRef} 
                        style={{
                          position: 'relative',
                          ...(previewType?.startsWith('image/') ? {} : { minWidth: '100%', minHeight: '100%' }),
                          width: 'fit-content',
                          transform: `scale(${zoomLevel})`,
                          transformOrigin: 'top left',
                          cursor: isAnnotating ? (activeTool === 'draw' || activeTool === 'erase' ? circleCursor : activeTool === 'pan' ? 'grab' : activeTool === 'text' ? 'text' : 'default') : 'default'
                        }}
                        onMouseDown={handleWrapperMouseDown}
                        onMouseMove={handleWrapperMouseMove}
                        onMouseUp={endDrag}
                        onTouchMove={handleWrapperTouchMove}
                        onTouchEnd={endDrag}
                        onClick={handleWrapperClick}
                      >
                        {previewType?.startsWith('image/') ? (
                          <img
                            src={previewUrl}
                            alt="Document Preview"
                            className="block max-w-none shadow-sm bg-white select-none"
                            draggable={false}
                          />
                        ) : (
                          <div ref={docxContainerRef} className="docx-preview-container select-none" />
                        )}
                        {isAnnotating && (
                          <>
                            <div className={`absolute top-0 left-0 w-full h-full z-10 ${activeTool === 'pan' ? '' : 'touch-none'}`} style={{ pointerEvents: (activeTool === 'pan' || activeTool === 'text') ? 'none' : 'auto', cursor: activeTool === 'draw' || activeTool === 'erase' ? circleCursor : 'default' }}>
                              <ReactSketchCanvas
                                ref={canvasRef}
                                style={{ border: 'none', background: 'transparent' }}
                                strokeWidth={strokeWidth}
                                strokeColor={strokeColor}
                                eraserWidth={strokeWidth * 2}
                                canvasColor="transparent"
                              />
                            </div>
                            
                            {/* Textbox Overlay */}
                            <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-20">
                              {textboxes.map((tb) => (
                                <div
                                  key={tb.id}
                                  className={`annotation-textbox absolute pointer-events-auto group ${selectedTextboxId === tb.id ? 'ring-2 ring-indigo-500' : ''}`}
                                  style={{ 
                                    left: `${tb.x}px`, 
                                    top: `${tb.y}px`,
                                    cursor: activeTool === 'text' ? 'text' : isDraggingState && selectedTextboxId === tb.id ? 'grabbing' : 'grab',
                                    touchAction: 'none'
                                  }}
                                  onMouseDown={(e) => handleTextboxMouseDown(e, tb.id)}
                                  onTouchStart={(e) => handleTextboxTouchStart(e, tb.id)}
                                >
                                  {tb.isEditing ? (
                                    <div className="relative">
                                      <textarea
                                        autoFocus
                                        value={tb.text}
                                        onChange={(e) => updateTextbox(tb.id, { text: e.target.value })}
                                        onBlur={(e) => handleTextareaBlur(e, tb.id)}
                                        className="bg-white/80 border border-indigo-300 rounded p-1 shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                        style={{ 
                                          color: tb.color, 
                                          fontSize: `${tb.fontSize}px`,
                                          minWidth: '100px',
                                          minHeight: '40px'
                                        }}
                                      />
                                      <div className="absolute -top-8 left-0 flex items-center bg-white border border-indigo-200 rounded shadow-sm p-1 gap-1">
                                        <button 
                                          onClick={() => updateTextbox(tb.id, { fontSize: Math.max(8, tb.fontSize - 2) })}
                                          className="p-1 hover:bg-gray-100 rounded text-xs"
                                        >-</button>
                                        <span className="text-[10px] w-6 text-center">{tb.fontSize}px</span>
                                        <button 
                                          onClick={() => updateTextbox(tb.id, { fontSize: Math.min(60, tb.fontSize + 2) })}
                                          className="p-1 hover:bg-gray-100 rounded text-xs"
                                        >+</button>
                                        <button 
                                          onClick={() => removeTextbox(tb.id)}
                                          className="p-1 hover:bg-red-50 text-red-500 rounded ml-1"
                                        >
                                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div 
                                      className="relative bg-transparent whitespace-pre-wrap p-1"
                                      style={{ color: tb.color, fontSize: `${tb.fontSize}px` }}
                                      onDoubleClick={() => updateTextbox(tb.id, { isEditing: true })}
                                    >
                                      {tb.text}
                                      {selectedTextboxId === tb.id && !isDraggingState && (
                                        <button 
                                          onClick={() => removeTextbox(tb.id)}
                                          className="absolute -top-4 -right-4 bg-red-500 text-white rounded-full p-0.5 shadow-sm hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ) : previewType === 'text/plain' ? (
                    <iframe src={previewUrl} className="w-full h-full bg-white shadow-sm border-0 p-4" />
                  ) : (
                    <div className="text-center p-8 bg-white rounded-lg shadow-sm border border-gray-100">
                      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <h3 className="mt-2 text-sm font-medium text-gray-900">Preview not available</h3>
                      <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
                        This file format ({previewType}) cannot be directly previewed in the web browser. Please download the file to view it.
                      </p>
                    </div>
                  )}

                  {showAnnotationsPanel && (
                    <div className="absolute top-0 right-0 h-full w-full sm:w-96 bg-white border-l border-gray-200 shadow-2xl z-30 flex flex-col">
                      <div className="p-3 border-b border-gray-200 flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            Document Annotations ({allAnnotations.length})
                          </p>
                          <p className="text-[11px] text-gray-500 truncate">
                            Centralized aggregate view
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAnnotationsPanel(false)}
                          className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100"
                          title="Close annotations"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      <div className="p-3 overflow-y-auto space-y-3">
                        {allAnnotations.length === 0 ? (
                          <div className="text-sm text-gray-600">
                            No annotations attached to this document.
                          </div>
                        ) : (
                          allAnnotations.map((ann) => (
                            <div key={ann.id} className="border border-gray-200 rounded-lg p-2 bg-white">
                              <div className="flex gap-3">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadAnnotation(ann.id, ann.fileId, ann.fileName)}
                                  className="w-20 h-16 bg-gray-50 border border-gray-200 rounded overflow-hidden flex items-center justify-center flex-shrink-0 hover:bg-gray-100"
                                  title="Download annotation"
                                >
                                  {annotationPreviews[ann.id] ? (
                                    <img
                                      src={annotationPreviews[ann.id]}
                                      alt={ann.fileName}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <span className="text-[10px] text-gray-500">Loading...</span>
                                  )}
                                </button>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-gray-900 truncate">{ann.fileName}</p>
                                    {selectedFile?.id === ann.fileId && (
                                       <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1 py-0.5 rounded border border-indigo-100 flex-shrink-0">Current File</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <p className="text-[10px] text-gray-500 truncate" title={`File: ${ann.fileName}`}>
                                      Source: {ann.fileName}
                                    </p>
                                    <span className="text-[10px] bg-gray-100 text-gray-600 px-1 py-0.5 rounded border border-gray-200">Page {ann.pageNumber}</span>
                                    {paginatedPreview?.fileId === ann.fileId && paginatedPreview?.page === ann.pageNumber && (
                                       <span className="text-[10px] bg-green-50 text-green-700 px-1 py-0.5 rounded border border-green-100 flex-shrink-0">Current Page</span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-gray-500">
                                    {format(new Date(ann.createdAt), 'MMM dd, yyyy HH:mm')}
                                    {ann.createdById === user?.id ? ' · You' : ''}
                                  </p>

                                  <div className="mt-2 flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadAnnotation(ann.id, ann.fileId, ann.fileName)}
                                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 underline"
                                    >
                                      Download
                                    </button>
                                    <span className="text-gray-300">|</span>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAnnotation(ann.id, ann.fileId)}
                                      disabled={annotationBusy}
                                      className="text-xs font-semibold text-red-600 hover:text-red-700 underline disabled:opacity-50"
                                    >
                                      {annotationBusy ? 'Working...' : 'Delete'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'versions' && (
              <div className="space-y-3">
                {doc.revisions.length > 0 ? (
                  <div className="space-y-3">
                    {doc.revisions.map((rev) => (
                      <details
                        key={rev.id}
                        className={`bg-white border rounded-lg shadow-sm overflow-hidden ${
                          rev.id === doc.currentRevisionId ? 'border-indigo-300' : 'border-gray-200'
                        }`}
                      >
                        <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-md ${
                                rev.id === doc.currentRevisionId ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-700'
                              }`}>
                                Rev {rev.revisionNumber}
                                {rev.id === doc.currentRevisionId && <span className="ml-2">(Current)</span>}
                              </span>
                              <span className="text-sm font-semibold text-gray-900 truncate">
                                {rev.createdBy?.name ?? 'Unknown'}
                              </span>
                              <span className="text-xs text-gray-500">
                                {format(new Date(rev.createdAt), 'MMM dd, yyyy HH:mm')}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {rev.files.length} file{rev.files.length === 1 ? '' : 's'}
                            </p>
                          </div>
                          <span className="text-xs text-gray-500">Toggle</span>
                        </summary>

                        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">File</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Annotations</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {rev.files.map((f) => (
                                <tr key={f.id}>
                                  <td className="px-4 py-3 text-sm text-gray-900">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="truncate">{f.fileName}</span>
                                      {f.isPrimary && (
                                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                                          Primary
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-500">{formatFileSize(f.fileSize)}</td>
                                  <td className="px-4 py-3 text-sm text-gray-500">{f.annotations?.length ?? 0}</td>
                                  <td className="px-4 py-3 text-sm font-medium space-x-3 whitespace-nowrap">
                                    <button
                                      onClick={() => handlePreview(f.id)}
                                      className="text-indigo-600 hover:text-indigo-900 font-medium"
                                    >
                                      Preview
                                    </button>
                                    <button
                                      onClick={() => handleDownloadVersion(f.id, f.fileName)}
                                      className="text-gray-700 hover:text-gray-900 font-medium"
                                    >
                                      Download
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg overflow-x-auto overflow-y-hidden shadow-inner">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Version
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            File Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Size
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Created By
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {(doc.versions ?? [])
                          .filter((v: DocumentVersion) => v.mimeType !== 'image/png')
                          .map((version: DocumentVersion) => (
                            <tr key={version.id} className={version.id === doc.currentVersionId ? 'bg-indigo-50' : ''}>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-md ${
                                  version.id === doc.currentVersionId
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {version.versionNumber}
                                  {version.id === doc.currentVersionId && (
                                    <span className="ml-2 text-indigo-600">(Current)</span>
                                  )}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{version.fileName}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatFileSize(version.fileSize)}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{version.createdBy.name}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {format(new Date(version.createdAt), 'MMM dd, yyyy')}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-3">
                                <button
                                  onClick={() => handlePreview(version.id)}
                                  className="text-indigo-600 hover:text-indigo-900 font-medium"
                                >
                                  Preview
                                </button>
                                <button
                                  onClick={() => handleDownloadVersion(version.id, version.fileName)}
                                  className="text-gray-600 hover:text-gray-900 font-medium"
                                >
                                  Download
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'complete' && canCompleteStep && !isDocumentComplete && (
              <div className="space-y-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <svg className="w-6 h-6 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <h4 className="text-sm font-semibold text-green-800">Complete this step</h4>
                      <p className="text-sm text-green-700 mt-1">
                        {isCurrentStepRequiringFile
                          ? doc?.currentStatus === 'CHANGES_REQUESTED'
                            ? 'An Approver has requested changes. Please upload an edited version of the document and add a comment to address their concerns to complete this step.'
                            : 'As a Drafter/Editor, you must upload a document to submit your draft.'
                          : showDisapproveOption ? 'Add a comment and click Approve to pass it to the next step, or Disapprove to send it back to the Drafter/Editor.' : 'Add a comment to complete this step and pass it to the next department.'}
                      </p>
                    </div>
                  </div>
                </div>

                {isCurrentStepRequiringFile && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Upload New Version <span className="text-red-500">*</span>
                    </label>
                    <div
                      className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg transition-all ${
                        dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400'
                      } ${uploadFiles.length > 0 ? 'border-green-500 bg-green-50' : ''}`}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                    >
                      <div className="space-y-1 text-center">
                        {uploadFiles.length > 0 ? (
                          <div className="w-full max-w-lg mx-auto space-y-2 text-left">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-sm font-semibold text-gray-900">
                                  {uploadFiles.length} file{uploadFiles.length === 1 ? '' : 's'} selected
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setUploadFiles([])}
                                className="text-xs font-semibold text-red-600 hover:text-red-700 underline"
                              >
                                Clear all
                              </button>
                            </div>

                            <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                              {uploadFiles.map((f, idx) => (
                                <div key={`${f.name}-${f.size}-${idx}`} className="flex items-center justify-between gap-3 bg-white/80 border border-green-200 rounded-md px-3 py-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{f.name}</p>
                                    <p className="text-xs text-gray-500">{formatFileSize(f.size)}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleUploadFileRemove(idx)}
                                    className="text-red-500 hover:text-red-700 flex-shrink-0"
                                    title="Remove file"
                                  >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              ))}
                            </div>

                            <p className="text-xs text-gray-500">
                              Add more by dragging here, or use the picker below.
                            </p>

                            <div className="flex items-center justify-center">
                              <label htmlFor="file-upload" className="cursor-pointer text-sm font-medium text-indigo-600 hover:text-indigo-500">
                                Add more files
                                <input
                                  id="file-upload"
                                  type="file"
                                  className="sr-only"
                                  onChange={handleFileChange}
                                  multiple
                                  accept=".docx,.pdf,.ppt,.pptx,.xls,.xlsx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                />
                              </label>
                            </div>
                          </div>
                        ) : (
                          <>
                            <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <div className="flex text-sm text-gray-600">
                              <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none">
                                <span>Upload a file</span>
                                <input
                                  id="file-upload"
                                  type="file"
                                  className="sr-only"
                                  onChange={handleFileChange}
                                  multiple
                                  accept=".docx,.pdf,.ppt,.pptx,.xls,.xlsx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                />
                              </label>
                              <p className="pl-1">or drag and drop</p>
                            </div>
                            <p className="text-xs text-gray-500">DOCX, PDF, PPT/PPTX, XLS/XLSX (multiple allowed)</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                     <label className="block text-sm font-medium text-gray-700">
                       Comment {isCommentRequired && <span className="text-red-500">*</span>}
                     </label>
                    <span className={`text-xs ${completeComment.length > 500 ? 'text-amber-600' : 'text-gray-400'}`}>
                      {completeComment.length}/500
                    </span>
                  </div>
                  <div className="relative">
                    <textarea
                      value={completeComment}
                      onChange={(e) => setCompleteComment(e.target.value)}
                      rows={4}
                      maxLength={500}
                      className={`block w-full sm:text-sm rounded-lg border transition-all duration-200 resize-none focus:outline-none p-4 ${
                        completeComment.trim()
                          ? 'border-indigo-300 focus:border-indigo-500 focus:ring-indigo-500'
                          : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'
                      } shadow-sm focus:ring-2 text-gray-900 placeholder:text-gray-400`}
                      placeholder="Add your comments, feedback, or approval notes..."
                    />
                    {completeComment && (
                      <button
                        type="button"
                        onClick={() => setCompleteComment('')}
                        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Clear comment"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <p className={`mt-1 text-xs ${completeComment.length > 450 && completeComment.length <= 500 ? 'text-amber-600' : completeComment.length > 500 ? 'text-red-600' : 'text-gray-400'}`}>
                    {completeComment.length === 0 && 'Start typing to add your comment'}
                    {completeComment.length > 0 && completeComment.length < 450 && 'Keep your comment concise and relevant'}
                    {completeComment.length > 450 && completeComment.length <= 500 && `You're close to the character limit (${500 - completeComment.length} remaining)`}
                  </p>
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <div className="flex items-center mb-4">
                    <button
                      type="button"
                      onClick={() => setIsConfidentialComment(!isConfidentialComment)}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${isConfidentialComment ? 'bg-indigo-600' : 'bg-gray-200'}`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isConfidentialComment ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                    <span className="ml-3 text-sm font-medium text-gray-900">Add Confidential Comment</span>
                  </div>

                  {isConfidentialComment && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <label className="block text-sm font-medium text-yellow-800">
                          Confidential Comment Details
                        </label>
                      </div>
                      <textarea
                        value={confidentialComment}
                        onChange={(e) => setConfidentialComment(e.target.value)}
                        rows={3}
                        className="block w-full sm:text-sm rounded-lg border-yellow-300 focus:border-yellow-500 focus:ring-yellow-500 shadow-sm p-3 bg-white text-gray-900 placeholder:text-gray-500"
                        placeholder="These details will only be visible to selected personnel..."
                      />
                      
                      <div>
                        <label className="block text-xs font-medium text-yellow-800 mb-1">
                          Visible To (Select personnel)
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 bg-white border border-yellow-200 rounded-md">
                          {uniquePersonnel.map((person: any) => (
                            <label key={person.id} className="flex items-center space-x-2 text-sm text-gray-700 p-1 hover:bg-yellow-100 rounded cursor-pointer">
                              <input
                                type="checkbox"
                                className="rounded text-indigo-600 focus:ring-indigo-500"
                                checked={confidentialCommentVisibleTo.includes(person.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setConfidentialCommentVisibleTo([...confidentialCommentVisibleTo, person.id])
                                  } else {
                                    setConfidentialCommentVisibleTo(confidentialCommentVisibleTo.filter(id => id !== person.id))
                                  }
                                }}
                              />
                              <span>{person.name}</span>
                            </label>
                          ))}
                          {uniquePersonnel.length === 0 && (
                            <span className="text-xs text-gray-400 italic">No personnel found</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-indigo-700 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828L18 9.828a4 4 0 00-5.656-5.656L6.757 9.757a6 6 0 108.486 8.486L20 13" />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-indigo-900">
                        Attached annotations ({actionAnnotations.length})
                      </h4>
                      <p className="text-xs text-indigo-800 mt-1">
                        These annotations are already attached to the current document files and will remain available after you {showDisapproveOption ? 'approve/disapprove' : 'complete'} this step.
                      </p>
                      {isCurrentStepRequiringFile && uploadFiles.length > 0 && (
                        <p className="text-[11px] text-indigo-700 mt-1">
                          Note: annotations are tied to existing files; newly uploaded files won’t have annotations until you add them.
                        </p>
                      )}

                      {actionAnnotations.length === 0 ? (
                        <p className="text-sm text-indigo-900/80 mt-3">
                          No annotations attached yet.
                        </p>
                      ) : (
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {actionAnnotations.map((ann) => (
                            <div key={ann.id} className="bg-white border border-indigo-100 rounded-lg p-2 flex gap-3">
                              <button
                                type="button"
                                onClick={() => handleDownloadAnnotation(ann.id, ann.fileId, `annotation-${ann.fileId}.png`)}
                                className="w-20 h-16 bg-gray-50 border border-gray-200 rounded overflow-hidden flex items-center justify-center flex-shrink-0 hover:bg-gray-100"
                                title="Download annotation"
                              >
                                {annotationPreviews[ann.id] ? (
                                  <img
                                    src={annotationPreviews[ann.id]}
                                    alt={ann.fileName}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span className="text-[10px] text-gray-500">Loading...</span>
                                )}
                              </button>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-gray-900 truncate" title={ann.fileName}>
                                  {ann.fileName} · <span className="text-indigo-600">Page {ann.pageNumber}</span>
                                </p>
                                <p className="text-[10px] text-gray-500 mt-0.5">
                                  {format(new Date(ann.createdAt), 'MMM dd, yyyy HH:mm')}
                                  {ann.createdById === user?.id ? ' · You' : ''}
                                </p>
                                <div className="mt-2 flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadAnnotation(ann.id, ann.fileId, `annotation-${ann.fileId}.png`)}
                                    className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-800 underline"
                                  >
                                    Download
                                  </button>
                                  <span className="text-gray-300">|</span>
                                  <button
                                    type="button"
                                    onClick={() => setShowAnnotationsPanel(true)}
                                    className="text-[11px] font-semibold text-gray-700 hover:text-gray-900 underline"
                                  >
                                    View all
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {submitError && (
                  <div className="bg-red-50 text-red-800 p-3 rounded-md text-sm">
                    {submitError}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3 pt-4 border-t">
                  <button
                    onClick={() => setActiveTab('details')}
                    className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-all font-medium w-full sm:w-auto text-center"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  {showDisapproveOption && (
                    <button
                      onClick={() => handleCompleteStep('disapprove-step')}
                      disabled={submitting || !completeComment.trim()}
                      className="px-6 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto text-center"
                      title="Request changes and send back to Drafter"
                    >
                      Disapprove
                    </button>
                  )}
                  <button
                    onClick={() => handleCompleteStep('complete-step')}
                    disabled={submitting}
                    className={`px-6 py-2 text-white rounded-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto text-center ${showDisapproveOption ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-green-600 hover:bg-green-700'}`}
                  >
                    {submitting ? (
                      <span className="flex items-center justify-center">
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Submitting...
                      </span>
                    ) : (
                      showDisapproveOption ? 'Approve' : 'Complete Step'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>

      {/* Cancel Submission Confirmation Modal */}
      {showCancelConfirm && (
        <div
          className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-[60] p-4"
          onClick={() => !isCancelling && setShowCancelConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5">
              <div className="flex items-center space-x-3">
                <div className="bg-white/20 rounded-full p-2">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Cancel & Delete Document</h3>
                  <p className="text-amber-100 text-sm">This action cannot be undone</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5">
              <p className="text-gray-700 text-sm mb-3">
                Are you sure you want to cancel and permanently delete <span className="font-semibold text-gray-900">&ldquo;{doc?.title}&rdquo;</span>?
              </p>
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 space-y-1.5">
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">The following will be removed:</p>
                <ul className="text-sm text-amber-700 space-y-1">
                  <li className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                    All document versions ({versionHistoryCount})
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                    Workflow timeline & comments
                  </li>
                  {doc?.referenceFiles && doc.referenceFiles.length > 0 && (
                    <li className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                      Reference files ({doc.referenceFiles.length})
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                disabled={isCancelling}
                className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 w-full sm:w-auto text-center"
              >
                Go Back
              </button>
              <button
                onClick={handleCancelDocument}
                disabled={isCancelling}
                className="px-5 py-2.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 w-full sm:w-auto shadow-sm"
              >
                {isCancelling ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Cancelling...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Cancel & Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-[60] p-4"
          onClick={() => !isDeleting && setShowDeleteConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-5">
              <div className="flex items-center space-x-3">
                <div className="bg-white/20 rounded-full p-2">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Delete Document</h3>
                  <p className="text-red-100 text-sm">This action cannot be undone</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5">
              <p className="text-gray-700 text-sm mb-3">
                Are you sure you want to permanently delete <span className="font-semibold text-gray-900">&ldquo;{doc?.title}&rdquo;</span>?
              </p>
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 space-y-1.5">
                <p className="text-xs font-semibold text-red-800 uppercase tracking-wide">The following will be removed:</p>
                <ul className="text-sm text-red-700 space-y-1">
                  <li className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                    All document versions ({versionHistoryCount})
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                    All drawing annotations ({totalAnnotationCount})
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                    Workflow history &amp; comments
                  </li>
                  {doc?.referenceFiles && doc.referenceFiles.length > 0 && (
                    <li className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                      Reference files ({doc.referenceFiles.length})
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 w-full sm:w-auto text-center"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteDocument}
                disabled={isDeleting}
                className="px-5 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 w-full sm:w-auto shadow-sm"
              >
                {isDeleting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Deleting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete Permanently
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
