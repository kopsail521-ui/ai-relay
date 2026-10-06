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
import { CircleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import type { SettingsSaveFailure } from '../hooks/use-settings-form'

type SettingsSaveErrorAlertProps = {
  failures: SettingsSaveFailure[]
  onDismiss: () => void
}

/**
 * Persistent banner listing option keys that failed to save. Unlike a toast
 * it stays visible until dismissed or the next successful save.
 */
export function SettingsSaveErrorAlert({
  failures,
  onDismiss,
}: SettingsSaveErrorAlertProps) {
  const { t } = useTranslation()

  if (failures.length === 0) {
    return null
  }

  const keyedFailures = failures.filter((failure) => failure.key)

  return (
    <Alert variant='destructive'>
      <CircleAlert className='size-4' />
      <AlertTitle>{t('Some settings were not saved')}</AlertTitle>
      <AlertDescription>
        <p>
          {t(
            'The following settings failed to save. They are still marked as unsaved — review them and save again.'
          )}
        </p>
        {keyedFailures.length > 0 && (
          <ul className='mt-2 list-disc space-y-1 pl-4'>
            {keyedFailures.map((failure) => (
              <li key={failure.key} className='break-all'>
                <span className='font-mono text-xs'>{failure.key}</span>
                {failure.message ? `: ${failure.message}` : ''}
              </li>
            ))}
          </ul>
        )}
        <Button
          type='button'
          size='sm'
          variant='outline'
          className='mt-3'
          onClick={onDismiss}
        >
          {t('Dismiss')}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
