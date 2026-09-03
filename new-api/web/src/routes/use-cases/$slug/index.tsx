/*
Copyright (C) 2023-2026 QuantumNous
*/
import { createFileRoute, notFound } from '@tanstack/react-router'

import { USE_CASE_PAGES, USE_CASE_SLUGS } from '@/features/seo-pages/content'
import { SeoContentPage, SeoIndexPage } from '@/features/seo-pages'

export const Route = createFileRoute('/use-cases/$slug/')({
  beforeLoad: ({ params }) => {
    if (!USE_CASE_SLUGS.includes(params.slug)) {
      throw notFound()
    }
  },
  component: UseCasePage,
})

function UseCasePage() {
  const { slug } = Route.useParams()
  const page = USE_CASE_PAGES[slug]
  return (
    <SeoContentPage page={page} canonicalPath={`/use-cases/${slug}`} />
  )
}
