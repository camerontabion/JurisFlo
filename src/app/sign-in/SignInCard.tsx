'use client'

import { useForm } from '@tanstack/react-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'

export default function SignInCard() {
  const signInForm = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
    onSubmit: async values => {
      await authClient.signIn.email({
        email: values.value.email,
        password: values.value.password,
        callbackURL: '/dashboard',
      })
    },
  })

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl">Sign in</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={e => {
            e.preventDefault()
            signInForm.handleSubmit()
          }}
          className="space-y-4"
        >
          <signInForm.Field
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
          <signInForm.Field
            name="password"
            children={field => (
              <Field>
                <FieldLabel>Password</FieldLabel>
                <Input
                  type="password"
                  value={field.state.value}
                  onChange={e => field.handleChange(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full"
                />
              </Field>
            )}
          />
          <signInForm.Subscribe
            selector={state => state.isSubmitting}
            children={isSubmitting => (
              <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                {isSubmitting ? 'Signing in...' : 'Sign in'}
              </Button>
            )}
          />
        </form>
      </CardContent>
    </Card>
  )
}
