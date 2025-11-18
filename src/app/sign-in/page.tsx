import { redirect } from 'next/navigation'
import { getToken } from '@/lib/auth-server'
import SignInCard from './SignInCard'
import SignUpCard from './SignUpCard'

export default async function SignInPage() {
  const token = await getToken()
  if (token) return redirect('/dashboard')

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-linear-to-br from-background via-background to-muted/20 p-4">
      <div className="space-y-2 text-center">
        <h1 className="font-bold text-3xl tracking-tight">Welcome to JurisFlo</h1>
        <p className="text-muted-foreground">Sign in to your account or create a new one</p>
      </div>
      <div className="grid w-full gap-6 md:w-2xl md:grid-cols-2">
        <SignInCard />
        <SignUpCard />
      </div>
    </main>
  )
}
