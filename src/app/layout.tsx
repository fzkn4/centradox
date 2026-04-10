import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { DraggableFAB } from '@/components/DraggableFAB'
import { Toaster } from 'sileo'
import { SocketProvider } from '@/components/providers/SocketProvider'
import { ClientInit } from '@/components/ClientInit'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'E-Document - Document Approval System',
  description: 'Document approval workflow management system',
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SocketProvider>
          <ClientInit />
          <Toaster position="bottom-right" theme="light" />
          {children}
          <DraggableFAB />
        </SocketProvider>
      </body>
    </html>
  )
}
