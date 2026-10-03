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

const STORAGE_PREFIX = 'keyo.giftWelcome.v1.'

/** Live-bundle marker — must appear in deployed /static/js/*.js */
export const GIFT_WELCOME_BUILD_MARKER = '__KEYO_GIFT_WELCOME_V14__'

export function giftWelcomeStorageKey(userId: number): string {
  return `${STORAGE_PREFIX}${userId}`
}

export function hasSeenGiftWelcome(userId: number): boolean {
  if (typeof window === 'undefined' || !userId) return true
  try {
    return window.localStorage.getItem(giftWelcomeStorageKey(userId)) === '1'
  } catch {
    return true
  }
}

export function markGiftWelcomeSeen(userId: number): void {
  if (typeof window === 'undefined' || !userId) return
  try {
    window.localStorage.setItem(giftWelcomeStorageKey(userId), '1')
  } catch {
    // ignore quota / private mode
  }
}

/** First-run overlay: unused accounts (gift or not) who have not dismissed it. */
export function shouldOfferGiftWelcome(user: {
  id?: number
  gift_quota?: number
  used_quota?: number
  request_count?: number
}): boolean {
  const id = user.id ?? 0
  if (!id) return false
  if (hasSeenGiftWelcome(id)) return false
  const used = Number(user.used_quota ?? 0)
  if (used > 0) return false
  const requests = Number(user.request_count ?? 0)
  if (requests > 0) return false
  return true
}
