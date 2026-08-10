import { SignUp } from '@clerk/nextjs'

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <SignUp routing="hash" signInUrl="/auth/login" />
    </main>
  )
}
