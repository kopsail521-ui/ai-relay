/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  AlertTriangle,
  Key,
  RefreshCw,
  TrendingDown,
  Users,
  Wallet,
} from 'lucide-react'

import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getFunnelStats } from './api'
import type {
  FunnelDailyRow,
  FunnelStatsPayload,
} from './types'

const PAY_SUCCESS_STATUSES = new Set(['success', 'completed', 'paid'])

const PAY_STATUS_LABELS: Record<string, string> = {
  success: '成功',
  completed: '成功',
  paid: '成功',
  pending: '待支付',
  failed: '失败',
  expired: '已超时',
  canceled: '已取消',
  cancelled: '已取消',
}

function payStatusTone(status: string): string {
  if (PAY_SUCCESS_STATUSES.has(status)) return 'text-emerald-600'
  if (status === 'pending') return 'text-amber-600'
  return 'text-red-600'
}

function formatCount(n: number | undefined): string {
  if (n === undefined || n === null) return '—'
  return Number(n).toLocaleString()
}

function formatMoney(n: number | undefined): string {
  if (n === undefined || n === null) return '—'
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function pct(part: number, total: number): string {
  if (!total) return '—'
  return `${Math.round((part / total) * 1000) / 10}%`
}

// i18n 语言码可能是 zhCN 这类非 BCP-47 形式，toLocaleString 遇到非法标签会抛 RangeError
function formatDateTime(tsSeconds: number, language: string | undefined): string {
  const date = new Date(tsSeconds * 1000)
  const tag = language
    ? language.replace(/^([a-zA-Z]{2,3})([A-Z]{2})$/, '$1-$2')
    : undefined
  try {
    return date.toLocaleString(tag || undefined, { hour12: false })
  } catch {
    return date.toLocaleString(undefined, { hour12: false })
  }
}

function FunnelStepCard(props: {
  icon: ReactNode
  label: string
  value: number
  conversion?: string
  hint?: string
}) {
  return (
    <Card className='relative'>
      {props.conversion ? (
        <Badge
          variant='secondary'
          className='absolute -top-2.5 left-4 tabular-nums'
        >
          {props.conversion}
        </Badge>
      ) : null}
      <CardContent className='flex flex-col gap-1 pt-6'>
        <div className='flex items-center gap-2 text-muted-foreground'>
          {props.icon}
          <span className='text-sm'>{props.label}</span>
        </div>
        <div className='text-3xl font-semibold tabular-nums'>
          {formatCount(props.value)}
        </div>
        {props.hint ? (
          <div className='text-xs text-muted-foreground'>{props.hint}</div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function DailyTrendTable({ daily }: { daily: FunnelDailyRow[] }) {
  const { t } = useTranslation()
  const maxDaily = Math.max(
    1,
    ...daily.map((r) => Math.max(r.new_users, r.consume_requests))
  )
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('Date')}</TableHead>
          <TableHead>{t('New Users')}</TableHead>
          <TableHead>{t('Consume Requests')}</TableHead>
          <TableHead>{t('Top-ups')}</TableHead>
          <TableHead>{t('Paid Amount')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {daily.map((r) => {
          const empty =
            !r.new_users && !r.consume_requests && !r.top_ups && !r.paid_money
          return (
            <TableRow key={r.date} className={empty ? 'text-muted-foreground' : ''}>
              <TableCell className='tabular-nums'>{r.date}</TableCell>
              <TableCell>
                <div className='relative min-w-24 tabular-nums'>
                  <span
                    className='absolute inset-y-1 left-0 max-w-[calc(100%-40px)] rounded bg-teal-200/70 dark:bg-teal-900/50'
                    style={{ width: `${(r.new_users / maxDaily) * 100}%` }}
                  />
                  <span className='relative'>
                    {r.new_users || ''}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className='relative min-w-24 tabular-nums'>
                  <span
                    className='absolute inset-y-1 left-0 max-w-[calc(100%-40px)] rounded bg-amber-200/70 dark:bg-amber-900/50'
                    style={{ width: `${(r.consume_requests / maxDaily) * 100}%` }}
                  />
                  <span className='relative'>
                    {r.consume_requests || ''}
                  </span>
                </div>
              </TableCell>
              <TableCell className='tabular-nums'>{r.top_ups || ''}</TableCell>
              <TableCell className='tabular-nums'>
                {r.paid_money ? formatMoney(r.paid_money) : ''}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export function Funnel() {
  const { t, i18n } = useTranslation()
  const [data, setData] = useState<FunnelStatsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const res = await getFunnelStats()
      if (!res.success || !res.data) {
        throw new Error(res.message || t('Load failed'))
      }
      setData(res.data)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  const funnel = data?.funnel
  const neverCalled = funnel ? funnel.registered - funnel.with_request : 0
  const insights: string[] = []
  if (funnel) {
    if (funnel.registered === 0) {
      insights.push(t('No registered users yet'))
    } else {
      insights.push(
        `${t('Registered but never called the API')}: ${formatCount(neverCalled)} (${pct(neverCalled, funnel.registered)})`
      )
    }
    if (funnel.paid_users === 0 && funnel.registered > 0) {
      insights.push(t('No paying users yet — check the payment channel if top-ups pile up in pending/failed, or the pricing page and onboarding if there are no top-up orders at all'))
    }
  }

  const statusLabel = (status: string) =>
    PAY_STATUS_LABELS[status] ?? status

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <span className='inline-flex min-w-0 items-center gap-2'>
          <span className='truncate'>{t('Funnel')}</span>
          <Badge variant='outline' className='shrink-0'>
            Admin
          </Badge>
        </span>
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='space-y-4'>
          <div className='flex items-center justify-between gap-3'>
            <p className='text-sm text-muted-foreground'>
              {t('Server-side data from the database — page views and click tracking need site analytics to be installed first')}
            </p>
            <Button
              variant='outline'
              size='sm'
              onClick={load}
              disabled={loading}
              className='shrink-0'
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              {t('Refresh')}
            </Button>
          </div>

          {errorMsg ? (
            <Alert variant='destructive'>
              <AlertTriangle className='size-4' />
              <AlertTitle>{t('Load failed')}</AlertTitle>
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          ) : null}

          {funnel ? (
            <>
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4'>
                <FunnelStepCard
                  icon={<Users className='size-4' />}
                  label={t('Registered Users')}
                  value={funnel.registered}
                  hint={t('including OAuth sign-ins')}
                />
                <FunnelStepCard
                  icon={<Key className='size-4' />}
                  label={t('Created API Key')}
                  value={funnel.key_users}
                  conversion={pct(funnel.key_users, funnel.registered)}
                  hint={t('activated once a key is issued')}
                />
                <FunnelStepCard
                  icon={<Activity className='size-4' />}
                  label={t('Made API Calls')}
                  value={funnel.consume_users}
                  conversion={pct(funnel.consume_users, funnel.key_users)}
                  hint={t('at least one successful consumption')}
                />
                <FunnelStepCard
                  icon={<Wallet className='size-4' />}
                  label={t('Paid Users')}
                  value={funnel.paid_users}
                  conversion={pct(funnel.paid_users, funnel.consume_users)}
                  hint={`${t('total paid')} ${formatMoney(funnel.paid_money)}`}
                />
              </div>

              {insights.length > 0 ? (
                <Alert>
                  <TrendingDown className='size-4' />
                  <AlertTitle>{t('Start here')}</AlertTitle>
                  <AlertDescription>
                    <ul className='list-disc pl-4'>
                      {insights.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className='grid grid-cols-1 gap-3 lg:grid-cols-2'>
                <Card>
                  <CardHeader>
                    <CardTitle className='text-base'>
                      {t('Top-up Status Distribution')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {data && data.pay_status.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('Status')}</TableHead>
                            <TableHead>{t('Orders')}</TableHead>
                            <TableHead>{t('Amount')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.pay_status.map((s) => (
                            <TableRow key={s.status}>
                              <TableCell>
                                <span
                                  className={`font-medium ${payStatusTone(s.status)}`}
                                >
                                  {statusLabel(s.status)}
                                </span>
                              </TableCell>
                              <TableCell className='tabular-nums'>
                                {formatCount(s.count)}
                              </TableCell>
                              <TableCell className='tabular-nums'>
                                {formatMoney(s.money)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className='text-sm text-muted-foreground'>
                        {t('No top-up orders yet — if top-up is live, verify the payment channel has been switched to production mode')}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className='text-base'>
                      {t('Recent Top-ups')}
                      <span className='ml-2 text-xs font-normal text-muted-foreground'>
                        {t('amounts in the payment channel currency')}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {data && data.recent_topups.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('Time')}</TableHead>
                            <TableHead>{t('User')}</TableHead>
                            <TableHead>{t('Amount')}</TableHead>
                            <TableHead>{t('Status')}</TableHead>
                            <TableHead>{t('Channel')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.recent_topups.map((topUp) => (
                            <TableRow key={topUp.id}>
                              <TableCell className='whitespace-nowrap tabular-nums'>
                                {topUp.create_time
                                  ? formatDateTime(topUp.create_time, i18n.language)
                                  : '—'}
                              </TableCell>
                              <TableCell>
                                <div className='font-medium'>
                                  {topUp.username || '—'}
                                </div>
                                {topUp.email ? (
                                  <div className='text-xs text-muted-foreground'>
                                    {topUp.email}
                                  </div>
                                ) : null}
                              </TableCell>
                              <TableCell className='tabular-nums'>
                                {formatMoney(topUp.money)}
                              </TableCell>
                              <TableCell>
                                <span
                                  className={`font-medium ${payStatusTone(topUp.status)}`}
                                >
                                  {statusLabel(topUp.status)}
                                </span>
                              </TableCell>
                              <TableCell>
                                {topUp.payment_method ||
                                  topUp.payment_provider ||
                                  '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className='text-sm text-muted-foreground'>
                        {t('No top-up orders yet')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>
                    {t('30-Day Trend')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data ? <DailyTrendTable daily={data.daily} /> : null}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
