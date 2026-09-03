/*
Copyright (C) 2023-2026 QuantumNous
*/
import { createFileRoute, notFound } from '@tanstack/react-router'

import {
  INTEGRATION_PAGES,
  INTEGRATION_SLUGS,
} from '@/features/seo-pages/content'
import { SeoContentPage, SeoIndexPage } from '@/features/seo-pages'

export const Route = createFileRoute('/integrations/$slug/')({
  beforeLoad: ({ params }) => {
    if (!INTEGRATION_SLUGS.includes(params.slug)) {
      throw notFound()
    }
  },
  component: IntegrationPage,
})

function IntegrationPage() {
  const { slug } = Route.useParams()
  const page = INTEGRATION_PAGES[slug]
  return (
    <SeoContentPage page={page} canonicalPath={`/integrations/${slug}`} />
  )
}
