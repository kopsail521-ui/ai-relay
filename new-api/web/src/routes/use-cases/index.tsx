/*
Copyright (C) 2023-2026 QuantumNous
*/
import { createFileRoute } from '@tanstack/react-router'

import { USE_CASE_PAGES } from '@/features/seo-pages/content'
import { SeoIndexPage } from '@/features/seo-pages'

export const Route = createFileRoute('/use-cases/')({
  component: UseCasesIndex,
})

function UseCasesIndex() {
  return (
    <SeoIndexPage
      title='KeyoAPI Use Cases - Multi-Model AI API'
      description='Image generation, speech-to-text and text-to-speech through one OpenAI-compatible API gateway.'
      canonicalPath='/use-cases'
      heading='Use Cases'
      intro='Common API workflows supported through KeyoAPI.'
      links={Object.values(USE_CASE_PAGES).map((p) => ({
        href: `/use-cases/${p.slug}`,
        label: p.h1,
        description: p.description,
      }))}
    />
  )
}
