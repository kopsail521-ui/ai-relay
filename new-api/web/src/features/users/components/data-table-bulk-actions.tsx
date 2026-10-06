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
import { type Table } from '@tanstack/react-table'
import { Power, PowerOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTableBulkActions as BulkActionsToolbar } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { manageUser } from '../api'
import { USER_ROLE } from '../constants'
import { type User } from '../types'
import { useUsers } from './users-provider'

interface DataTableBulkActionsProps {
  table: Table<User>
}

type BulkStatusAction = 'enable' | 'disable'

export function DataTableBulkActions({ table }: DataTableBulkActionsProps) {
  const { t } = useTranslation()
  const { triggerRefresh } = useUsers()
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false)
  const [pendingAction, setPendingAction] =
    useState<BulkStatusAction | null>(null)

  const selectedRows = table.getFilteredSelectedRowModel().rows
  // Root users cannot be disabled by the backend; skip them up front.
  const selectedIds = selectedRows.reduce<number[]>((ids, row) => {
    const user = row.original
    if (typeof user.id === 'number' && user.role !== USER_ROLE.ROOT) {
      ids.push(user.id)
    }
    return ids
  }, [])

  const handleClearSelection = () => {
    table.resetRowSelection()
  }

  const runBulkStatusAction = async (action: BulkStatusAction) => {
    if (pendingAction) return
    if (selectedIds.length === 0) {
      toast.error(t('No users selected'))
      return
    }

    setPendingAction(action)
    let succeeded = 0
    let failed = 0
    try {
      const results = await Promise.allSettled(
        selectedIds.map((id) => manageUser(id, action))
      )
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success) {
          succeeded += 1
        } else {
          failed += 1
        }
      }

      if (succeeded > 0) {
        toast.success(
          action === 'enable'
            ? t('{{count}} user(s) enabled', { count: succeeded })
            : t('{{count}} user(s) disabled', { count: succeeded })
        )
        triggerRefresh()
        handleClearSelection()
      }
      if (failed > 0) {
        toast.error(
          action === 'enable'
            ? t('{{count}} user(s) failed to enable', { count: failed })
            : t('{{count}} user(s) failed to disable', { count: failed })
        )
      }
    } finally {
      setPendingAction(null)
      setDisableConfirmOpen(false)
    }
  }

  const isLoading = pendingAction !== null

  return (
    <>
      <BulkActionsToolbar table={table} entityName='user'>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='outline'
                size='icon'
                onClick={() => runBulkStatusAction('enable')}
                disabled={isLoading || selectedIds.length === 0}
                className='size-8'
                aria-label={t('Enable selected users')}
                title={t('Enable selected users')}
              />
            }
          >
            <Power />
            <span className='sr-only'>{t('Enable selected users')}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('Enable selected users')}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='outline'
                size='icon'
                onClick={() => setDisableConfirmOpen(true)}
                disabled={isLoading || selectedIds.length === 0}
                className='size-8'
                aria-label={t('Disable selected users')}
                title={t('Disable selected users')}
              />
            }
          >
            <PowerOff />
            <span className='sr-only'>{t('Disable selected users')}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('Disable selected users')}</p>
          </TooltipContent>
        </Tooltip>
      </BulkActionsToolbar>

      {/* Disable Confirmation Dialog */}
      <ConfirmDialog
        open={disableConfirmOpen}
        onOpenChange={(open) => {
          if (isLoading) return
          setDisableConfirmOpen(open)
        }}
        title={t('Disable Users?')}
        desc={t(
          'Are you sure you want to disable {{count}} selected users? They will immediately be unable to log in and use the API.',
          { count: selectedIds.length }
        )}
        confirmText={isLoading ? t('Processing...') : t('Disable')}
        isLoading={isLoading}
        handleConfirm={() => runBulkStatusAction('disable')}
      />
    </>
  )
}
