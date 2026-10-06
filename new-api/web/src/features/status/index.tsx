/*
Copyright (C) 2023-2026 QuantumNous
*/
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { usePageMeta } from '@/hooks/use-page-meta'
import { getStatus } from '@/lib/api'
import { SITE_ORIGIN } from '@/lib/seo'

export function StatusPage() {
  const { t, i18n } = useTranslation()
  usePageMeta({
    title: 'KeyoAPI Status - API Gateway Uptime',
    description:
      'Check KeyoAPI gateway status, version and service availability.',
    canonical: `${SITE_ORIGIN}/status`,
  })

  const { data, isLoading, isError, dataUpdatedAt, refetch, isRefetching } =
    useQuery({
      queryKey: ['public-status'],
      queryFn: getStatus,
      refetchInterval: 60_000,
    })

  const online = !isError && !!data

  return (
    <PublicLayout>
      <div className='mx-auto max-w-2xl px-4 py-10'>
        <h1 className='mb-2 text-3xl font-bold'>{t('Service Status')}</h1>
        <p className='text-muted-foreground mb-8'>
          {t('KeyoAPI OpenAI-compatible API gateway')}
        </p>

        {isLoading ? (
          <Skeleton className='h-24 w-full' />
        ) : (
          <div className='border-border rounded-lg border p-6'>
            <div className='mb-4 flex items-center gap-3'>
              {online ? (
                <CheckCircle2 className='h-6 w-6 text-green-600' />
              ) : (
                <XCircle className='h-6 w-6 text-red-600' />
              )}
              <span className='text-lg font-semibold'>
                {online
                  ? t('API gateway is reachable')
                  : t('Unable to reach API')}
              </span>
            </div>
            {data ? (
              <dl className='grid gap-2 text-sm'>
                <div className='flex justify-between gap-4'>
                  <dt className='text-muted-foreground'>{t('System')}</dt>
                  <dd>{String(data.system_name ?? 'KeyoAPI')}</dd>
                </div>
                <div className='flex justify-between gap-4'>
                  <dt className='text-muted-foreground'>{t('Version')}</dt>
                  <dd>{String(data.version ?? '—')}</dd>
                </div>
                <div className='flex justify-between gap-4'>
                  <dt className='text-muted-foreground'>{t('API endpoint')}</dt>
                  <dd className='font-mono text-xs'>{SITE_ORIGIN}/v1</dd>
                </div>
              </dl>
            ) : null}
            <div className='mt-4 flex items-center justify-between gap-4'>
              <p className='text-muted-foreground text-xs'>
                {t('Last checked at {{time}}', {
                  time: new Date(dataUpdatedAt).toLocaleString(i18n.language),
                })}
              </p>
              {!online && (
                <Button
                  size='sm'
                  variant='outline'
                  className='h-8 gap-1.5 rounded-sm px-3 text-xs font-medium'
                  disabled={isRefetching}
                  onClick={() => refetch()}
                >
                  <RefreshCw
                    className={isRefetching ? 'animate-spin' : undefined}
                  />
                  {t('Retry now')}
                </Button>
              )}
            </div>
          </div>
        )}

        <p className='text-muted-foreground mt-6 text-sm'>
          {t('For support:')}{' '}
          <a href='mailto:kopsail521@gmail.com' className='text-primary'>
            kopsail521@gmail.com
          </a>
        </p>
      </div>
    </PublicLayout>
  )
}

