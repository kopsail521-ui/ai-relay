/*
Copyright (C) 2023-2026 QuantumNous
*/
import { createFileRoute } from '@tanstack/react-router'

import { BlogIndex } from '@/features/blog'

export const Route = createFileRoute('/blog/')({
  component: BlogIndex,
})
