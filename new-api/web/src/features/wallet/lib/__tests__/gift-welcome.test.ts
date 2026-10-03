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
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

import {
  GIFT_WELCOME_BUILD_MARKER,
  giftWelcomeStorageKey,
  hasSeenGiftWelcome,
  markGiftWelcomeSeen,
  shouldOfferGiftWelcome,
} from '../gift-welcome'

describe('gift-welcome', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offers welcome for unused gift recipients', () => {
    expect(
      shouldOfferGiftWelcome({
        id: 7,
        gift_quota: 5_000_000,
        used_quota: 0,
        request_count: 0,
      })
    ).toBe(true)
  })

  it('offers welcome for unused accounts without gift credits', () => {
    expect(
      shouldOfferGiftWelcome({
        id: 11,
        gift_quota: 0,
        used_quota: 0,
        request_count: 0,
      })
    ).toBe(true)
  })

  it('skips when already seen', () => {
    markGiftWelcomeSeen(7)
    expect(hasSeenGiftWelcome(7)).toBe(true)
    expect(
      shouldOfferGiftWelcome({
        id: 7,
        gift_quota: 5_000_000,
        used_quota: 0,
        request_count: 0,
      })
    ).toBe(false)
  })

  it('skips users with usage', () => {
    expect(
      shouldOfferGiftWelcome({
        id: 8,
        gift_quota: 5_000_000,
        used_quota: 1,
        request_count: 0,
      })
    ).toBe(false)
  })

  it('skips users who already sent requests', () => {
    expect(
      shouldOfferGiftWelcome({
        id: 9,
        gift_quota: 5_000_000,
        used_quota: 0,
        request_count: 3,
      })
    ).toBe(false)
  })

  it('uses stable storage key', () => {
    expect(giftWelcomeStorageKey(42)).toBe('keyo.giftWelcome.v1.42')
  })

  it('ships a live-bundle marker for deploy checks', () => {
    expect(GIFT_WELCOME_BUILD_MARKER).toMatch(/^__KEYO_GIFT_WELCOME_V\d+__$/)
  })
})
