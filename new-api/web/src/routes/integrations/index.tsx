/*
Copyright (C) 2023-2026 QuantumNous
*/
import { createFileRoute } from '@tanstack/react-router'

import { INTEGRATION_PAGES } from '@/features/seo-pages/content'
import { SeoIndexPage } from '@/features/seo-pages'

export const Route = createFileRoute('/integrations/')({
  component: IntegrationsIndex,
})

function IntegrationsIndex() {
  return (
    <SeoIndexPage
      title='KeyoAPI Integrations - OpenAI Compatible API Gateway'
      description='Integration guides for Python, Node.js, Cursor, Continue.dev and OpenAI SDK with a custom base URL.'
      canonicalPath='/integrations'
      heading='Integrations'
      intro='Connect your tools to KeyoAPI with OpenAI-compatible SDKs and custom base URLs.'
      links={Object.values(INTEGRATION_PAGES).map((p) => ({
        href: `/integrations/${p.slug}`,
        label: p.h1,
        description: p.description,
      }))}
    />
  )
}
