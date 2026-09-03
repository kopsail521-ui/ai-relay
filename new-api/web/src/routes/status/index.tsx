/*
Copyright (C) 2023-2026 QuantumNous
*/
import { createFileRoute } from '@tanstack/react-router'

import { StatusPage } from '@/features/status'

export const Route = createFileRoute('/status/')({
  component: StatusPage,
})
