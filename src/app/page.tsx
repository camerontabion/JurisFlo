'use client'

import { Authenticated, Unauthenticated } from 'convex/react'
import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <Authenticated>
        <Link href="/dashboard">Dashboard</Link>
      </Authenticated>
      <Unauthenticated>
        <Link href="/sign-in">Sign in</Link>
      </Unauthenticated>
    </main>
  )
}
