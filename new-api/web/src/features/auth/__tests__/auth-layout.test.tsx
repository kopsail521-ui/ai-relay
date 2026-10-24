/*
Copyright (C) 2023-2026 QuantumNous
*/
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, test, vi } from 'vitest'

import { AuthLayout } from '../auth-layout'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { to: string; children: ReactNode; className?: string }) => (
    <a href={props.to} className={props.className}>
      {props.children}
    </a>
  ),
}))
vi.mock('@/components/language-switcher', () => ({
  LanguageSwitcher: () => <button type='button'>Change language</button>,
}))
vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    systemName: 'KeyoAPI',
    logo: '/logo.png',
    loading: false,
  }),
}))

describe('authentication page layout', () => {
  test('the brand and language header occupies its own row above long forms', () => {
    render(
      <AuthLayout>
        <h2>Create an account</h2>
        <form aria-label='Registration form' />
      </AuthLayout>
    )

    const header = screen.getByRole('banner')
    const main = screen.getByRole('main')
    expect(header).toContainElement(
      screen.getByRole('link', { name: /KeyoAPI/ })
    )
    expect(header).toContainElement(
      screen.getByRole('button', { name: 'Change language' })
    )
    expect(main).toContainElement(
      screen.getByRole('form', { name: 'Registration form' })
    )
    expect(header.classList.contains('absolute')).toBe(false)
    expect(header.parentElement).toHaveClass('min-h-svh')
    expect(header.parentElement).not.toHaveClass('h-svh')
  })
})
