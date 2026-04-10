'use client'

import { useEffect } from 'react'
import { initializeConsoleSilencer } from '@/lib/console-silencer'

export function ClientInit() {
  useEffect(() => {
    initializeConsoleSilencer()
  }, [])

  return null
}
