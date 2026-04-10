'use client'

/**
 * This utility silences noisy console logs from browser extensions (like Bitwarden, 1Password, etc.)
 * that frequently clutter the development console but are unrelated to the application.
 */
export function initializeConsoleSilencer() {
  if (typeof window === 'undefined' || process.env.NODE_ENV !== 'development') {
    return
  }

  const noisySubstrings = [
    'Bitwarden',
    'SignalR',
    'WebPush',
    'WASM SDK',
    'Retrieving application id',
    'Message sender appears to be internal',
    'The extensions gallery cannot be scripted',
    'No tab with id',
    'bootstrap-autofill-overlay',
    'initialize_user_crypto',
    'index complete took',
    'decrypt complete took',
    'cipherService',
    'SignalR Connected',
    'Assuming empty state'
  ]

  const originalLog = console.log
  const originalWarn = console.warn
  const originalError = console.error

  const filter = (args: any[], originalFn: (...args: any[]) => void) => {
    const message = args.map(arg => String(arg)).join(' ')
    const isNoisy = noisySubstrings.some(substring => 
      message.toLowerCase().includes(substring.toLowerCase())
    )

    if (!isNoisy) {
      originalFn(...args)
    }
  }

  console.log = (...args) => filter(args, originalLog)
  console.warn = (...args) => filter(args, originalWarn)
  console.error = (...args) => filter(args, originalError)
}
