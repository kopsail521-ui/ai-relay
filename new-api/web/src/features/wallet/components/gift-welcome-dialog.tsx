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
import { useNavigate } from '@tanstack/react-router'
import { Copy, Gift, Loader2, TerminalSquare } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { resolveStarterCurl } from '@/features/dashboard/lib/starter-curl'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { getSelf } from '@/lib/api'
import { formatQuota } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'

import {
  GIFT_WELCOME_BUILD_MARKER,
  markGiftWelcomeSeen,
  shouldOfferGiftWelcome,
} from '../lib/gift-welcome'

type SelfPayload = {
  id?: number
  gift_quota?: number
  used_quota?: number
  request_count?: number
}

async function loadSelfWithRetry(attempts = 5): Promise<SelfPayload | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await getSelf()
      if (res?.success && res.data) return res.data as SelfPayload
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 300 * (i + 1)))
  }
  return null
}

/**
 * First-login gift credits notice + prefilled curl (real API key).
 * Uses a portal overlay (not Base UI Dialog) so OAuth navigation cannot swallow it.
 */
export function GiftWelcomeDialog() {
  // Keep marker in the live bundle for deploy verification.
  void GIFT_WELCOME_BUILD_MARKER

  const { t } = useTranslation()
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.auth.user?.id)
  const accessToken = useAuthStore((s) => s.auth.accessToken)
  const setUser = useAuthStore((s) => s.auth.setUser)
  const [open, setOpen] = useState(false)
  const [giftQuota, setGiftQuota] = useState(0)
  const [curl, setCurl] = useState<string | null>(null)
  const [curlLoading, setCurlLoading] = useState(false)
  const [isCopying, setIsCopying] = useState(false)
  const shownRef = useRef(false)
  const runIdRef = useRef(0)
  const { copyToClipboard } = useCopyToClipboard({ notify: false })

  const dismiss = useCallback((id: number) => {
    markGiftWelcomeSeen(id)
    shownRef.current = false
    setOpen(false)
  }, [])

  useEffect(() => {
    if (!userId || !accessToken) return

    const runId = ++runIdRef.current
    let openTimer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    async function check() {
      // Prefetch paste-ready curl in parallel with /self so the overlay
      // opens with a real key already filled (not after a second wait).
      setCurlLoading(true)
      const curlPromise = resolveStarterCurl()
        .then((ready) => ready?.curl ?? null)
        .catch(() => null)

      const data = await loadSelfWithRetry()
      if (cancelled || runId !== runIdRef.current) return

      const authUser = useAuthStore.getState().auth.user
      const snapshot: SelfPayload = data
        ? {
            id: data.id ?? userId,
            gift_quota: data.gift_quota,
            used_quota: data.used_quota,
            request_count: data.request_count,
          }
        : {
            id: userId,
            gift_quota: authUser?.gift_quota,
            used_quota: authUser?.used_quota,
            request_count: authUser?.request_count,
          }

      if (data && authUser && authUser.id === userId) {
        setUser({
          ...authUser,
          gift_quota: data.gift_quota,
          used_quota: data.used_quota ?? authUser.used_quota,
          request_count: data.request_count ?? authUser.request_count,
        })
      }

      if (!shouldOfferGiftWelcome(snapshot)) {
        setCurlLoading(false)
        return
      }

      const readyCurl = await curlPromise
      if (cancelled || runId !== runIdRef.current) return
      setCurl(readyCurl)
      setCurlLoading(false)
      setGiftQuota(Number(snapshot.gift_quota ?? 0))
      openTimer = setTimeout(() => {
        if (cancelled || runId !== runIdRef.current) return
        shownRef.current = true
        setOpen(true)
      }, 300)
    }

    void check()
    return () => {
      cancelled = true
      if (openTimer) clearTimeout(openTimer)
    }
  }, [userId, accessToken, setUser])

  const handleCopyCurl = async () => {
    if (!curl || isCopying) return
    setIsCopying(true)
    try {
      const copied = await copyToClipboard(curl)
      if (copied) {
        toast.success(t('Copied to clipboard'))
      } else {
        toast.error(t('Failed to copy to clipboard'))
      }
    } finally {
      setIsCopying(false)
    }
  }

  if (!open || typeof document === 'undefined') return null

  const amountLabel = formatQuota(giftQuota)

  return createPortal(
    <div
      data-keyo-gift-welcome={GIFT_WELCOME_BUILD_MARKER}
      className='fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4'
      role='dialog'
      aria-modal='true'
      aria-labelledby='keyo-gift-welcome-title'
    >
      <div className='bg-popover text-popover-foreground ring-foreground/10 w-full max-w-lg rounded-xl p-5 shadow-lg ring-1'>
        <div className='flex items-center gap-2.5'>
          <IconBadge tone='chart-3'>
            <Gift />
          </IconBadge>
          <h2 id='keyo-gift-welcome-title' className='text-base font-semibold'>
            {giftQuota > 0
              ? t("You've got {{amount}} gift credits", {
                  amount: amountLabel,
                })
              : t('Run your first request')}
          </h2>
        </div>
        <p className='text-muted-foreground mt-3 text-sm leading-relaxed'>
          {t(
            'Paste the curl below into a terminal. The free model and your API key are already filled in — you should see a JSON reply within a few seconds. No credit card.'
          )}
        </p>
        {giftQuota > 0 ? (
          <p className='text-muted-foreground mt-2 text-xs leading-relaxed'>
            {t(
              'Gift credits are for free models only. Paid models use your recharge balance.'
            )}
          </p>
        ) : null}

        <div className='bg-muted/40 mt-4 overflow-hidden rounded-lg border'>
          <div className='flex items-center justify-between gap-2 border-b px-3 py-2'>
            <div className='flex min-w-0 items-center gap-2'>
              <TerminalSquare className='text-muted-foreground size-3.5 shrink-0' />
              <span className='truncate text-xs font-medium'>
                {t('Run this first')}
              </span>
            </div>
            <Button
              type='button'
              size='sm'
              variant='secondary'
              className='h-7 shrink-0 gap-1 px-2 text-xs'
              disabled={!curl || curlLoading || isCopying}
              onClick={() => {
                void handleCopyCurl()
              }}
            >
              {curlLoading ? (
                <Loader2 className='size-3.5 animate-spin' />
              ) : (
                <Copy className='size-3.5' />
              )}
              {t('Copy curl')}
            </Button>
          </div>
          <pre className='max-h-44 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap select-all'>
            {curlLoading
              ? t('Preparing your first request…')
              : (curl ??
                t(
                  'Could not prepare a starter key yet. Open Dashboard → First API request.'
                ))}
          </pre>
        </div>

        <div className='mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end'>
          <Button
            variant='outline'
            onClick={() => {
              if (userId) dismiss(userId)
            }}
          >
            {t('Got it')}
          </Button>
          {giftQuota > 0 ? (
            <Button
              variant='outline'
              onClick={() => {
                if (userId) dismiss(userId)
                void navigate({ to: '/wallet' })
              }}
            >
              {t('View wallet')}
            </Button>
          ) : null}
          <Button
            disabled={!curl || curlLoading || isCopying}
            onClick={() => {
              void handleCopyCurl()
            }}
          >
            {curlLoading ? (
              <Loader2 className='size-4 animate-spin' />
            ) : (
              <Copy className='size-4' />
            )}
            {t('Copy curl')}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
