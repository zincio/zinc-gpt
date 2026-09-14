import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import './globals.css'
import { Providers } from '@/providers/providers'

export const metadata: Metadata = {
  title: 'Zinc GPT',
  description: 'Shop any retailer by chat',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body className={GeistSans.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
