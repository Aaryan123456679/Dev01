import { SignIn } from '@clerk/nextjs'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <SignIn routing="hash" signUpUrl="/auth/register" />
    </main>
  )
}
