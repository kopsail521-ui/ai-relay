/*
Copyright (C) 2023-2026 QuantumNous
*/
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { RichContent } from '@/components/rich-content'
import { Skeleton } from '@/components/ui/skeleton'
import { useTheme } from '@/context/theme-provider'
import { usePageMeta } from '@/hooks/use-page-meta'
import { getStatus } from '@/lib/api'
import { isHttpUrl, isLikelyHtml } from '@/lib/content-format'
import { SITE_ORIGIN } from '@/lib/seo'

function withLangParam(url: string, lang: string): string {
  try {
    const next = new URL(url, window.location.origin)
    next.searchParams.set('lang', lang)
    return next.toString()
  } catch {
    return url
  }
}

const DEFAULT_DOCS_URL = '/brand/keyo-docs.html'

export function Docs() {
  const { i18n, t } = useTranslation()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { resolvedTheme } = useTheme()

  usePageMeta({
    title: 'KeyoAPI Documentation - OpenAI Compatible API',
    description:
      'Integration docs for KeyoAPI: authentication, endpoints, model catalog, pricing and SDK setup for Python, Node.js and Cursor.',
    canonical: `${SITE_ORIGIN}/docs`,
  })

  const { data: status, isLoading } = useQuery({
    queryKey: ['status'],
    queryFn: getStatus,
    staleTime: 60_000,
  })

  const rawContent = (status?.docs_link as string | undefined)?.trim() ?? ''
  const docsUrl = rawContent || DEFAULT_DOCS_URL
  const isUrl = isHttpUrl(docsUrl) || docsUrl.startsWith('/')
  const iframeSrc = useMemo(
    () =>
      isUrl
        ? withLangParam(
            docsUrl.startsWith('http')
              ? docsUrl
              : new URL(docsUrl, window.location.origin).toString(),
            i18n.language
          )
        : docsUrl,
    [docsUrl, i18n.language, isUrl]
  )

  const syncIframePreferences = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { themeMode: resolvedTheme },
        '*'
      )
      iframeRef.current?.contentWindow?.postMessage(
        { lang: i18n.language },
        '*'
      )
    } catch {
      /* cross-origin */
    }
  }, [i18n.language, resolvedTheme])

  useEffect(() => {
    syncIframePreferences()
  }, [syncIframePreferences])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data
      if (!data || typeof data !== 'object') return
      if (data.type === 'keyo-brand-ready') syncIframePreferences()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [syncIframePreferences])

  if (isLoading && !rawContent) {
    return (
      <PublicLayout>
        <div className='mx-auto flex max-w-4xl flex-col gap-4 py-12'>
          <Skeleton className='h-8 w-[45%]' />
          <Skeleton className='h-4 w-full' />
        </div>
      </PublicLayout>
    )
  }

  if (isUrl) {
    return (
      <PublicLayout showMainContainer={false}>
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          className='h-[calc(100vh-3.5rem)] w-full border-0'
          title={t('Docs')}
          sandbox='allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts allow-top-navigation-by-user-activation'
          onLoad={() => {
            syncIframePreferences()
            window.setTimeout(syncIframePreferences, 100)
            window.setTimeout(syncIframePreferences, 400)
          }}
        />
      </PublicLayout>
    )
  }

  const contentIsHtml = isLikelyHtml(docsUrl)
  if (contentIsHtml) {
    return (
      <PublicLayout showMainContainer={false}>
        <RichContent
          mode='html'
          htmlVariant='isolated'
          content={docsUrl}
          className='prose-neutral dark:prose-invert max-w-none'
        />
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <div className='mx-auto max-w-6xl px-4 py-8'>
        <RichContent
          mode='markdown'
          content={docsUrl}
          className='prose-neutral dark:prose-invert max-w-none'
        />
      </div>
    </PublicLayout>
  )
}
