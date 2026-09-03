/*
Copyright (C) 2023-2026 QuantumNous
*/
import { Link } from '@tanstack/react-router'

import { PublicLayout } from '@/components/layout'
import { usePageMeta } from '@/hooks/use-page-meta'
import { SITE_ORIGIN } from '@/lib/seo'

import type { SeoPageContent } from './content'

type SeoContentPageProps = {
  page: SeoPageContent
  canonicalPath: string
}

export function SeoContentPage({ page, canonicalPath }: SeoContentPageProps) {
  usePageMeta({
    title: page.title,
    description: page.description,
    canonical: `${SITE_ORIGIN}${canonicalPath}`,
  })

  return (
    <PublicLayout>
      <article className='mx-auto max-w-3xl px-4 py-10'>
        <h1 className='mb-4 text-3xl font-bold tracking-tight'>{page.h1}</h1>
        <p className='text-muted-foreground mb-8 text-lg leading-relaxed'>
          {page.intro}
        </p>

        <div className='space-y-8'>
          {page.sections.map((section) => (
            <section key={section.heading}>
              <h2 className='mb-3 text-xl font-semibold'>{section.heading}</h2>
              {section.body ? (
                <p className='text-muted-foreground mb-3 leading-relaxed'>
                  {section.body}
                </p>
              ) : null}
              {section.code ? (
                <pre className='bg-muted overflow-x-auto rounded-lg p-4 text-sm'>
                  <code>{section.code}</code>
                </pre>
              ) : null}
            </section>
          ))}
        </div>

        {page.relatedLinks.length > 0 ? (
          <nav className='border-border mt-10 border-t pt-6'>
            <h2 className='mb-3 text-sm font-semibold uppercase tracking-wide'>
              Related
            </h2>
            <ul className='flex flex-wrap gap-4'>
              {page.relatedLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className='text-primary text-sm hover:underline'
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </article>
    </PublicLayout>
  )
}

export function SeoIndexPage(props: {
  title: string
  description: string
  canonicalPath: string
  heading: string
  intro: string
  links: Array<{ href: string; label: string; description?: string }>
}) {
  usePageMeta({
    title: props.title,
    description: props.description,
    canonical: `${SITE_ORIGIN}${props.canonicalPath}`,
  })

  return (
    <PublicLayout>
      <div className='mx-auto max-w-3xl px-4 py-10'>
        <h1 className='mb-4 text-3xl font-bold tracking-tight'>
          {props.heading}
        </h1>
        <p className='text-muted-foreground mb-8 text-lg'>{props.intro}</p>
        <ul className='space-y-4'>
          {props.links.map((item) => (
            <li
              key={item.href}
              className='border-border rounded-lg border p-4'
            >
              <Link
                to={item.href}
                className='text-primary font-medium hover:underline'
              >
                {item.label}
              </Link>
              {item.description ? (
                <p className='text-muted-foreground mt-1 text-sm'>
                  {item.description}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </PublicLayout>
  )
}
