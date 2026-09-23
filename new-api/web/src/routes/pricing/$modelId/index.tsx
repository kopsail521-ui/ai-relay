/*
Copyright (C) 2023-2026 QuantumNous
*/
import { createFileRoute, redirect } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import z from 'zod'

import { LoadingState } from '@/components/loading-state'
import { getFreshModuleAccess } from '@/lib/nav-modules'
import { useAuthStore } from '@/stores/auth-store'

const ModelDetailsPage = lazy(() =>
  import('@/features/pricing/components/model-details').then(({ ModelDetails }) => ({
    default: ModelDetails,
  }))
)

function ModelDetailsRoute() {
  return (
    <Suspense fallback={<LoadingState className='min-h-svh' />}>
      <ModelDetailsPage />
    </Suspense>
  )
}

const pricingDetailsSearchSchema = z.object({
  search: z.string().optional(),
  sort: z.string().optional(),
  vendor: z.string().optional(),
  group: z.string().optional(),
  quotaType: z.string().optional(),
  endpointType: z.string().optional(),
  tag: z.string().optional(),
  tokenUnit: z.enum(['M', 'K']).optional(),
  view: z.enum(['card', 'table']).optional().catch(undefined),
  rechargePrice: z.boolean().optional(),
})

export const Route = createFileRoute('/pricing/$modelId/')({
  validateSearch: pricingDetailsSearchSchema,
  beforeLoad: async ({ location }) => {
    const access = await getFreshModuleAccess('pricing')
    if (!access.enabled) {
      throw redirect({ to: '/' })
    }
    if (access.requireAuth) {
      const { auth } = useAuthStore.getState()
      if (!auth.user) {
        throw redirect({
          to: '/sign-in',
          search: { redirect: location.href },
        })
      }
    }
  },
  component: ModelDetailsRoute,
})
