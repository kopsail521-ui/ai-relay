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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/language-switcher'
import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()

  return (
    <div className='bg-background relative flex min-h-svh max-w-none flex-col'>
      <div
        aria-hidden
        className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_55%)]'
      />
      <header className='relative z-10 flex shrink-0 items-center justify-between gap-4 px-4 py-4 sm:px-8 sm:py-8'>
        <Link
          to='/'
          reloadDocument
          className='flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-80'
        >
          <div className='relative h-8 w-8 shrink-0 overflow-hidden rounded-sm'>
            {loading ? (
              <Skeleton className='absolute inset-0 rounded-sm' />
            ) : (
              <img
                src={logo}
                alt={t('Logo')}
                className='h-8 w-8 rounded-sm object-cover'
              />
            )}
          </div>
          {loading ? (
            <Skeleton className='h-6 w-24' />
          ) : (
            <h1 className='truncate text-lg font-semibold tracking-tight'>
              {systemName}
            </h1>
          )}
        </Link>
        <div className='shrink-0'>
          <LanguageSwitcher />
        </div>
      </header>
      <main className='relative z-[1] flex flex-1 items-center px-4 py-8 sm:px-8'>
        <div className='mx-auto flex w-full max-w-[440px] flex-col justify-center space-y-3'>
          {children}
        </div>
      </main>
    </div>
  )
}
