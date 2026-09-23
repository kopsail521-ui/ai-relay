/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { createFileRoute, redirect } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { z } from 'zod'

import { LoadingState } from '@/components/loading-state'
import { sanitizeAuthRedirect } from '@/features/auth/lib/auth-redirect'
import { useAuthStore } from '@/stores/auth-store'

const SignInPage = lazy(() =>
  import('@/features/auth/sign-in').then(({ SignIn }) => ({ default: SignIn }))
)

function SignInRoute() {
  return (
    <Suspense fallback={<LoadingState className='min-h-svh' />}>
      <SignInPage />
    </Suspense>
  )
}

const searchSchema = z.object({
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/(auth)/sign-in')({
  component: SignInRoute,
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const { auth } = useAuthStore.getState()

    // 如果已经有用户信息，说明已登录
    if (auth.user) {
      const target =
        sanitizeAuthRedirect(search?.redirect, window.location.origin) ??
        '/dashboard'
      throw redirect({ href: target, replace: true })
    }
  },
})
