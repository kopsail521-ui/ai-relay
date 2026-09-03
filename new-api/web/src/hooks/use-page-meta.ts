/*
Copyright (C) 2023-2026 QuantumNous
*/
import { useEffect } from 'react'

import { applyPageMeta, type PageMeta } from '@/lib/seo'

export function usePageMeta(meta: PageMeta) {
  useEffect(() => {
    applyPageMeta(meta)
  }, [meta.title, meta.description, meta.canonical, meta.ogImage, meta.noIndex])
}
