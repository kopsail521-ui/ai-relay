/*
Copyright (C) 2023-2026 QuantumNous
*/
import { createFileRoute, redirect } from '@tanstack/react-router'

/** Legacy path: marketplace is public at /pricing ( /models is auth-gated in older builds ). */
export const Route = createFileRoute('/models/')({
  beforeLoad: ({ location }) => {
    throw redirect({
      to: '/pricing',
      search: location.search as Record<string, unknown>,
      replace: true,
    })
  },
})
