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
import { Gift } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
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
 * First-login gift credits notice.
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
  const shownRef = useRef(false)
  const runIdRef = useRef(0)

  const dismiss = useCallback(
    (id: number) => {
      markGiftWelcomeSeen(id)
      shownRef.current = false
      setOpen(false)
    },
    []
  )

  useEffect(() => {
    if (!userId || !accessToken) return

    const runId = ++runIdRef.current
    let openTimer: ReturnType<typeof setTimeout> | undefined

    async function check() {
      const data = await loadSelfWithRetry()
      if (runId !== runIdRef.current) return

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

      if (!shouldOfferGiftWelcome(snapshot)) return

      setGiftQuota(Number(snapshot.gift_quota ?? 0))
      openTimer = setTimeout(() => {
        if (runId !== runIdRef.current) return
        shownRef.current = true
        setOpen(true)
      }, 500)
    }

    void check()
    return () => {
      if (openTimer) clearTimeout(openTimer)
    }
  }, [userId, accessToken, setUser])

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
      <div className='bg-popover text-popover-foreground ring-foreground/10 w-full max-w-md rounded-xl p-5 shadow-lg ring-1'>
        <div className='flex items-center gap-2.5'>
          <IconBadge tone='chart-3'>
            <Gift />
          </IconBadge>
          <h2 id='keyo-gift-welcome-title' className='text-base font-semibold'>
            {t("You've got {{amount}} gift credits", { amount: amountLabel })}
          </h2>
        </div>
        <p className='text-muted-foreground mt-3 text-sm leading-relaxed'>
          {t(
            'Welcome to KeyoAPI. Gift credits work only on free model IDs (for example glm-5.3-flash:free). Public price stays $0; usage is deducted from gift credits at the paid twin sell rate. Recharge balance is separate — use it for paid models.'
          )}
        </p>
        <div className='mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end'>
          <Button
            variant='outline'
            onClick={() => {
              if (userId) dismiss(userId)
            }}
          >
            {t('Got it')}
          </Button>
          <Button
            variant='outline'
            onClick={() => {
              if (userId) dismiss(userId)
              void navigate({ to: '/wallet' })
            }}
          >
            {t('View wallet')}
          </Button>
          <Button
            onClick={() => {
              if (userId) dismiss(userId)
              // Stay in SPA — /free-models is a static SEO page, not a console route.
              void navigate({ to: '/models' })
            }}
          >
            {t('Try free models')}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
