import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL('https://decisiontaker.vercel.app'),
  title: 'Decision Engine - Master Your Choices with AI',
  description: "Don't just decide—strategize. Analyze your toughest choices using frameworks from 'Thinking in Bets', 'Decisive', and 100+ other top mental model books.",
  openGraph: {
    title: 'Decision Engine - Master Your Choices with AI',
    description: "Don't just decide—strategize. Analyze your toughest choices using frameworks from 'Thinking in Bets', 'Decisive', and 100+ other top mental model books.",
    url: 'https://decisiontaker.vercel.app',
    siteName: 'Decision Engine',
    images: [
      {
        url: '/logo.png',
        width: 800,
        height: 800,
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Decision Engine - Master Your Choices with AI',
    description: "Analyze your toughest choices using mental models.",
    images: ['/logo.png'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}