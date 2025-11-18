import { fetchQuery } from 'convex/nextjs'
import { redirect } from 'next/navigation'
import { api } from '@/convex/_generated/api'
import { getToken } from '@/lib/auth-server'
import DocumentList from './DocumentList'
import DocumentUploader from './DocumentUploader'
import UserProfile from './UserProfile'

export default async function DashboardPage() {
  const token = await getToken()
  if (!token) return redirect('/sign-in')

  const user = await fetchQuery(api.auth.getCurrentUser, {}, { token })

  return (
    <div className="min-h-screen space-y-4 p-4">
      <header className="flex w-full items-center justify-between">
        <h1 className="font-bold text-2xl">Dashboard</h1>
        <UserProfile user={user} />
      </header>
      <main className="flex w-full max-w-6xl flex-col items-center justify-center gap-4">
        <DocumentUploader />
        <DocumentList />
      </main>
    </div>
  )
}
