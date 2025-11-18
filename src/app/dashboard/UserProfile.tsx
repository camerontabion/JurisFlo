'use client'

import { LogOutIcon, TrashIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { api } from '@/convex/_generated/api'
import { authClient } from '@/lib/auth-client'

interface UserProfileProps {
  user: typeof api.auth.getCurrentUser._returnType
}

export default function UserProfile({ user }: UserProfileProps) {
  const router = useRouter()

  const firstName = user.name?.split(' ')[0] || user.email?.split('@')[0] || 'U'
  const initial = firstName.charAt(0).toUpperCase()
  const displayName = user.name || user.email || 'User'
  const displayEmail = user.email || ''

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: { onSuccess: () => router.push('/sign-in') },
    })
  }

  const handleDeleteAccount = async () => {
    await authClient.deleteUser({
      fetchOptions: { onSuccess: () => router.push('/sign-in') },
    })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full bg-primary/10 text-primary hover:bg-primary/20"
        >
          <span className="font-semibold text-sm">{initial}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="font-semibold text-sm">{displayName}</p>
            <p className="text-muted-foreground text-xs">{displayEmail}</p>
          </div>
          <Button variant="outline" className="w-full" onClick={handleLogout}>
            <LogOutIcon className="size-4" />
            Logout
          </Button>
          <Button variant="outline" className="w-full" onClick={handleDeleteAccount}>
            <TrashIcon className="size-4" />
            Delete Account
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
