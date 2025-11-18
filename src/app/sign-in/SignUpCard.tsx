'use client'

import { useForm } from '@tanstack/react-form'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'

export default function SignUpCard() {
  const router = useRouter()

  const signUpForm = useForm({
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },
    onSubmit: async values => {
      await authClient.signUp.email({
        name: values.value.name,
        email: values.value.email,
        password: values.value.password,
        fetchOptions: { onSuccess: () => router.push('/dashboard') },
      })
    },
  })

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl">Sign up</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={e => {
            e.preventDefault()
            signUpForm.handleSubmit()
          }}
          className="space-y-4"
        >
          <signUpForm.Field
            name="name"
            children={field => (
              <Field>
                <FieldLabel>Name</FieldLabel>
                <Input
                  type="text"
                  value={field.state.value}
                  onChange={e => field.handleChange(e.target.value)}
                  placeholder="Your name"
                  className="w-full"
                />
              </Field>
            )}
          />
          <signUpForm.Field
            name="email"
            children={field => (
              <Field>
                <FieldLabel>Email</FieldLabel>
                <Input
                  type="email"
                  value={field.state.value}
                  onChange={e => field.handleChange(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full"
                />
              </Field>
            )}
          />
          <signUpForm.Field
            name="password"
            children={field => (
              <Field>
                <FieldLabel>Password</FieldLabel>
                <Input
                  type="password"
                  value={field.state.value}
                  onChange={e => field.handleChange(e.target.value)}
                  placeholder="Create a password"
                  className="w-full"
                />
              </Field>
            )}
          />
          <signUpForm.Subscribe
            selector={state => state.isSubmitting}
            children={isSubmitting => (
              <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                {isSubmitting ? 'Signing up...' : 'Sign up'}
              </Button>
            )}
          />
        </form>
      </CardContent>
    </Card>
  )
}
