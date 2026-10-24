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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { describe, expect, it, vi } from 'vitest'

import { sendPasswordResetEmail } from '@/features/auth/api'

import { ForgotPasswordForm } from '../forgot-password-form'

const config = vi.hoisted(() => ({ available: false }))
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: { password_reset_available: config.available } }),
}))
vi.mock('@/features/auth/hooks/use-turnstile', () => ({
  useTurnstile: () => ({
    isTurnstileEnabled: false,
    validateTurnstile: () => true,
  }),
}))
vi.mock('@/features/auth/api', () => ({ sendPasswordResetEmail: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

describe('password recovery availability', () => {
  it('explains unavailable email recovery and provides support without offering a broken form', () => {
    config.available = false
    render(<ForgotPasswordForm />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Email password reset is currently unavailable'
    )
    expect(
      screen.getByRole('link', { name: 'Help and support' })
    ).toHaveAttribute('href', '/brand/faq.html')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
  it('keeps the response conditional because success does not prove mail was delivered', async () => {
    config.available = true
    vi.mocked(sendPasswordResetEmail).mockResolvedValue({
      success: true,
      message: '',
    })
    render(<ForgotPasswordForm />)
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Email' }),
      'user@example.com'
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Send reset email' })
    )
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'If this email is bound to an account and email delivery succeeds, you will receive a reset link.'
      )
    )
  })
})
