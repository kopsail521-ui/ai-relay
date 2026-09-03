/*
Copyright (C) 2023-2026 QuantumNous
*/
import { Link } from '@tanstack/react-router'

import { PublicLayout } from '@/components/layout'
import { usePageMeta } from '@/hooks/use-page-meta'
import { SITE_ORIGIN } from '@/lib/seo'

export function BlogIndex() {
  usePageMeta({
    title: 'KeyoAPI Blog - API Integration Guides',
    description:
      'Tutorials and guides for OpenAI-compatible API integration, multi-model gateways, and developer workflows.',
    canonical: `${SITE_ORIGIN}/blog`,
  })

  return (
    <PublicLayout>
      <div className='mx-auto max-w-3xl px-4 py-10'>
        <h1 className='mb-4 text-3xl font-bold'>Blog</h1>
        <p className='text-muted-foreground mb-8'>
          Integration tutorials and API guides for global developers.
        </p>
        <ul className='space-y-4'>
          <li className='border-border rounded-lg border p-4'>
            <Link
              to='/integrations/openai-sdk'
              className='text-primary font-medium hover:underline'
            >
              How to change OpenAI base URL
            </Link>
            <p className='text-muted-foreground mt-1 text-sm'>
              Point any OpenAI SDK client at KeyoAPI.
            </p>
          </li>
          <li className='border-border rounded-lg border p-4'>
            <Link
              to='/integrations/python'
              className='text-primary font-medium hover:underline'
            >
              How to use OpenAI compatible API in Python
            </Link>
          </li>
          <li className='border-border rounded-lg border p-4'>
            <Link
              to='/integrations/nodejs'
              className='text-primary font-medium hover:underline'
            >
              How to use OpenAI compatible API in Node.js
            </Link>
          </li>
          <li className='border-border rounded-lg border p-4'>
            <Link
              to='/integrations/cursor'
              className='text-primary font-medium hover:underline'
            >
              Cursor custom API not working — setup guide
            </Link>
          </li>
        </ul>
      </div>
    </PublicLayout>
  )
}
