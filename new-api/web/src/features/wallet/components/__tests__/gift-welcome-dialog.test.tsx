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
import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { GiftWelcomeDialog } from '../gift-welcome-dialog'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/lib/api', () => ({
  getSelf: vi.fn().mockResolvedValue({
    success: true,
    data: { id: 801, gift_quota: 5000000, used_quota: 0, request_count: 0 },
  }),
}))
vi.mock('@/features/dashboard/lib/starter-curl', () => ({
  resolveStarterCurl: vi
    .fn()
    .mockResolvedValue({ curl: 'curl test-model:free' }),
}))

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState((state) => ({
    auth: {
      ...state.auth,
      accessToken: 'test-session',
      user: {
        id: 801,
        username: 'new-user',
        role: 1,
        gift_quota: 5000000,
        used_quota: 0,
        request_count: 0,
      },
    },
  }))
})

afterEach(() => {
  useAuthStore.getState().auth.reset()
  localStorage.clear()
})

describe('gift welcome billing notice', () => {
  it('shows gift-first usage billing and recharge shortfall on the first-login dialog', async () => {
    render(<GiftWelcomeDialog />)
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          element.textContent?.includes(
            'Calls are billed at the corresponding model rate. Gift credits are used first; any shortfall is charged to your recharge balance.'
          ) === true
      )
    ).toBeInTheDocument()
    expect(
      await within(dialog).findByText('curl test-model:free')
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByText(/free models only/i)
    ).not.toBeInTheDocument()
  })
})
