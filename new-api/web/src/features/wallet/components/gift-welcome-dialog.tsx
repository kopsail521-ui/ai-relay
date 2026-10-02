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
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { IconBadge } from '@/components/ui/icon-badge'
import { getSelf } from '@/lib/api'
import { formatQuota } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'

import {
  markGiftWelcomeSeen,
  shouldOfferGiftWelcome,
} from '../lib/gift-welcome'

type SelfPayload = {
  id?: number
  gift_quota?: number
  used_quota?: number
  request_count?: number
}

export function GiftWelcomeDialog() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.auth.user?.id)
  const setUser = useAuthStore((s) => s.auth.setUser)
  const [open, setOpen] = useState(false)
  const [giftQuota, setGiftQuota] = useState(0)

  const dismiss = useCallback((id: number) => {
    markGiftWelcomeSeen(id)
    setOpen(false)
  }, [])

  useEffect(() => {
    if (!userId) return

    let cancelled = false
    let openTimer: ReturnType<typeof setTimeout> | undefined

    async function check() {
      // Always load /api/user/self — OAuth login bundles can race the layout mount.
      let snapshot: SelfPayload = { id: userId }
      try {
        const res = await getSelf()
        if (cancelled) return
        if (res?.success && res.data) {
          const data = res.data as SelfPayload
          snapshot = {
            id: data.id ?? userId,
            gift_quota: data.gift_quota,
            used_quota: data.used_quota,
            request_count: data.request_count,
          }
          const authUser = useAuthStore.getState().auth.user
          if (authUser && authUser.id === userId) {
            setUser({
              ...authUser,
              gift_quota: data.gift_quota,
              used_quota: data.used_quota ?? authUser.used_quota,
              request_count: data.request_count ?? authUser.request_count,
            })
          }
        }
      } catch {
        return
      }

      if (cancelled) return
      if (!shouldOfferGiftWelcome(snapshot)) return

      setGiftQuota(Number(snapshot.gift_quota ?? 0))
      // Defer open until after OAuth → dashboard navigation settles.
      openTimer = setTimeout(() => {
        if (!cancelled) setOpen(true)
      }, 400)
    }

    void check()
    return () => {
      cancelled = true
      if (openTimer) clearTimeout(openTimer)
    }
  }, [userId, setUser])

  const amountLabel = formatQuota(giftQuota)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && userId) dismiss(userId)
        else setOpen(next)
      }}
    >
      <DialogContent className='sm:max-w-md' showCloseButton>
        <DialogHeader className='gap-3'>
          <div className='flex items-center gap-2.5'>
            <IconBadge tone='chart-3'>
              <Gift />
            </IconBadge>
            <DialogTitle>
              {t("You've got {{amount}} gift credits", {
                amount: amountLabel,
              })}
            </DialogTitle>
          </div>
          <DialogDescription className='text-start text-sm leading-relaxed'>
            {t(
              'Welcome to KeyoAPI. Gift credits work only on free model IDs (for example glm-5.3-flash:free). Public price stays $0; usage is deducted from gift credits at the paid twin sell rate. Recharge balance is separate — use it for paid models.'
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className='bg-transparent sm:justify-stretch'>
          <div className='flex w-full flex-col gap-2 sm:flex-row sm:justify-end'>
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
                window.location.assign('/free-models')
              }}
            >
              {t('Try free models')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
