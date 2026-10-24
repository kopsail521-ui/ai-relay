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
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

export function PricingLoadError(props: {
  onRetry: () => void
  isRetrying: boolean
}) {
  const { t } = useTranslation()
  return (
    <div
      role='alert'
      className='mx-auto my-16 max-w-xl space-y-4 rounded-xl border p-6 text-center'
    >
      <h1 className='text-lg font-semibold'>
        {t('The model catalog could not be loaded')}
      </h1>
      <p className='text-muted-foreground text-sm'>
        {t('Check your connection and try again. Your filters have been kept.')}
      </p>
      <Button onClick={props.onRetry} disabled={props.isRetrying}>
        {t(props.isRetrying ? 'Loading...' : 'Try again')}
      </Button>
    </div>
  )
}
