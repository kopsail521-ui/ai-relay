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
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { PasswordInput } from '@/components/password-input'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

import { updateUserProfile } from '../../api'

// ============================================================================
// Change Password Dialog Component
// ============================================================================

const changePasswordSchema = z
  .object({
    originalPassword: z.string().min(1, 'Please enter your current password'),
    newPassword: z
      .string()
      .min(1, 'Please enter a new password')
      .min(8, 'Password must be between 8 and 20 characters')
      .max(20, 'Password must be between 8 and 20 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.newPassword !== data.originalPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

interface ChangePasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  username: string
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
  username,
}: ChangePasswordDialogProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)

  const form = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      originalPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  const handleSubmit = async (values: z.infer<typeof changePasswordSchema>) => {
    try {
      setLoading(true)
      const response = await updateUserProfile({
        original_password: values.originalPassword,
        password: values.newPassword,
      })

      if (response.success) {
        toast.success(t('Password changed successfully'))
        onOpenChange(false)
        form.reset()
      } else {
        toast.error(response.message || t('Failed to change password'))
      }
    } catch (_error) {
      toast.error(t('Failed to change password'))
    } finally {
      setLoading(false)
    }
  }

  const formId = 'change-password-form'

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Change Password')}
      description={
        <>
          {t('Update your password for account:')} <strong>{username}</strong>
        </>
      }
      contentClassName='sm:max-w-md'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {t('Cancel')}
          </Button>
          <Button type='submit' form={formId} disabled={loading}>
            {loading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {loading ? t('Changing...') : t('Change Password')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={formId}
          onSubmit={form.handleSubmit(handleSubmit)}
          className='space-y-4'
        >
          <FormField
            control={form.control}
            name='originalPassword'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Current Password')}</FormLabel>
                <FormControl>
                  <PasswordInput
                    placeholder={t('Enter password')}
                    disabled={loading}
                    autoComplete='current-password'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='newPassword'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('New Password')}</FormLabel>
                <FormControl>
                  <PasswordInput
                    placeholder={t('Enter password (8-20 characters)')}
                    disabled={loading}
                    autoComplete='new-password'
                    {...field}
                  />
                </FormControl>
                <FormDescription className='text-muted-foreground text-xs'>
                  {t('Password must be between 8 and 20 characters')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='confirmPassword'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Confirm New Password')}</FormLabel>
                <FormControl>
                  <PasswordInput
                    placeholder={t('Confirm password')}
                    disabled={loading}
                    autoComplete='new-password'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </Dialog>
  )
}
