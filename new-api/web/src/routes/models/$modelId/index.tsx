/*
Copyright (C) 2023-2026 QuantumNous
*/
import { createFileRoute, redirect } from '@tanstack/react-router'

/** Legacy path: model details are public at /pricing/$modelId. */
export const Route = createFileRoute('/models/$modelId/')({
  beforeLoad: ({ params, location }) => {
    throw redirect({
      to: '/pricing/$modelId',
      params: { modelId: params.modelId },
      search: location.search as Record<string, unknown>,
      replace: true,
    })
  },
})
