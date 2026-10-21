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
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, Copy, Info, KeyRound, Settings2, WalletCards } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm, type SubmitErrorHandler } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DateTimePicker } from '@/components/datetime-picker'
import {
  SideDrawerSection,
  SideDrawerSectionHeader,
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
  sideDrawerSwitchItemClassName,
} from '@/components/drawer-layout'
import { MultiSelect } from '@/components/multi-select'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useStatus } from '@/hooks/use-status'
import { getUserModels, getUserGroups } from '@/lib/api'
import { getCurrencyDisplay, getCurrencyLabel } from '@/lib/currency'
import { cn } from '@/lib/utils'

import {
  createApiKey,
  updateApiKey,
  getApiKey,
  getTokenAutoGroups,
} from '../api'
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../constants'
import {
  getApiKeyFormSchema,
  type ApiKeyFormValues,
  getApiKeyFormDefaultValues,
  transformFormDataToPayload,
  transformApiKeyToFormDefaults,
  ROUTING_STRATEGIES,
  type RoutingStrategy,
  computeStrategyGroupOrder,
  detectStrategyFromGroups,
} from '../lib'
import type { ApiKey } from '../types'
import {
  ApiKeyGroupCombobox,
  type ApiKeyGroupOption,
} from './api-key-group-combobox'
import { useApiKeys } from './api-keys-provider'
import { AutoGroupOrderEditor } from './auto-group-order-editor'

type ApiKeyMutateDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: ApiKey
}

export function ApiKeysMutateDrawer({
  open,
  onOpenChange,
  currentRow,
}: ApiKeyMutateDrawerProps) {
  const { t } = useTranslation()
  const isUpdate = !!currentRow
  const currentRowId = currentRow?.id
  const { triggerRefresh } = useApiKeys()
  const { status, loading: statusLoading } = useStatus()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [initializedTarget, setInitializedTarget] = useState<string | null>(
    null
  )
  // Number of keys created by the latest submit; non-null switches the drawer
  // body to the success guide (the create API never returns the plaintext key).
  const [createdCount, setCreatedCount] = useState<number | null>(null)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const defaultUseAutoGroup = status?.default_use_auto_group === true

  // Fetch models
  const { data: modelsData } = useQuery({
    queryKey: ['user-models'],
    queryFn: getUserModels,
    enabled: open,
    staleTime: 0,
  })

  // Fetch groups
  const {
    data: groupsData,
    isFetched: groupsFetched,
    isFetching: groupsFetching,
  } = useQuery({
    queryKey: ['user-groups'],
    queryFn: getUserGroups,
    enabled: open,
    staleTime: 0,
  })

  const {
    data: apiKeyData,
    isFetched: apiKeyFetched,
    isFetching: apiKeyFetching,
  } = useQuery({
    queryKey: ['api-key', currentRowId],
    queryFn: () => getApiKey(currentRowId ?? 0),
    enabled: open && isUpdate && currentRowId !== undefined,
    staleTime: 0,
  })

  const {
    data: autoGroupsData,
    isFetched: autoGroupsFetched,
    isFetching: autoGroupsFetching,
  } = useQuery({
    queryKey: ['token-auto-groups'],
    queryFn: getTokenAutoGroups,
    enabled: open,
    staleTime: 0,
  })

  const models = modelsData?.data || []
  const groups = useMemo<ApiKeyGroupOption[]>(
    () =>
      Object.entries(groupsData?.data || {}).map(([key, info]) => ({
        value: key,
        label: key,
        desc: info.desc || key,
        ratio: info.ratio,
      })),
    [groupsData]
  )
  const backendHasAuto = groups.some((g) => g.value === 'auto')
  const availableAutoGroupNames = useMemo(
    () => groups.filter((group) => group.value !== 'auto').map((g) => g.value),
    [groups]
  )
  const globalAutoGroups = useMemo(() => {
    const available = new Set(availableAutoGroupNames)
    return (autoGroupsData?.data?.groups || []).filter((group) =>
      available.has(group)
    )
  }, [autoGroupsData, availableAutoGroupNames])
  const globalAutoGroupOptions = useMemo(() => {
    const groupsByValue = new Map(groups.map((group) => [group.value, group]))
    return globalAutoGroups.flatMap((group) => {
      const option = groupsByValue.get(group)
      return option ? [option] : []
    })
  }, [globalAutoGroups, groups])
  const maxAutoGroups =
    Number.isInteger(autoGroupsData?.data?.max_count) &&
    Number(autoGroupsData?.data?.max_count) > 0
      ? Number(autoGroupsData?.data?.max_count)
      : 5
  const schema = useMemo(
    () => getApiKeyFormSchema(t, maxAutoGroups),
    [t, maxAutoGroups]
  )

  const form = useForm<ApiKeyFormValues>({
    resolver: zodResolver(schema),
    defaultValues: getApiKeyFormDefaultValues(defaultUseAutoGroup),
  })

  // Load existing data when updating
  useEffect(() => {
    if (!open) {
      setInitializedTarget(null)
      // Buttons close the drawer via onOpenChange directly, which does not
      // pass through the Sheet's own close handler — reset here as well.
      setCreatedCount(null)
      setCreatedKey(null)
      return
    }
    if (
      !groupsFetched ||
      groupsFetching ||
      !autoGroupsFetched ||
      autoGroupsFetching
    ) {
      return
    }
    if (isUpdate && (!apiKeyFetched || apiKeyFetching)) return
    if (!isUpdate && statusLoading) return

    const target = isUpdate && currentRow ? `update:${currentRow.id}` : 'create'
    if (initializedTarget === target) return
    if (isUpdate && currentRow) {
      if (apiKeyData?.success && apiKeyData.data) {
        const defaults = transformApiKeyToFormDefaults(
          apiKeyData.data,
          availableAutoGroupNames,
          maxAutoGroups
        )
        const detected = detectStrategyFromGroups(
          defaults.auto_groups,
          groups,
          globalAutoGroups,
          maxAutoGroups
        )
        form.reset({
          ...defaults,
          routing_strategy: detected,
        })
        setInitializedTarget(target)
      }
    } else {
      form.reset(
        getApiKeyFormDefaultValues(defaultUseAutoGroup && backendHasAuto)
      )
      setInitializedTarget(target)
    }
  }, [
    open,
    isUpdate,
    currentRow,
    form,
    defaultUseAutoGroup,
    statusLoading,
    backendHasAuto,
    groupsFetched,
    groupsFetching,
    autoGroupsFetched,
    autoGroupsFetching,
    apiKeyData,
    apiKeyFetched,
    apiKeyFetching,
    availableAutoGroupNames,
    maxAutoGroups,
    initializedTarget,
  ])

  const formTarget =
    isUpdate && currentRow ? `update:${currentRow.id}` : 'create'
  const isFormInitialized = initializedTarget === formTarget
  const selectedGroup = form.watch('group')
  const isSmartRouting = selectedGroup === 'auto'
  const currentStrategy =
    (form.watch('routing_strategy') || 'smart') as RoutingStrategy

  const handleToggleSmartRouting = (enabled: boolean) => {
    if (enabled) {
      form.setValue('group', 'auto', { shouldDirty: true })
      form.setValue('cross_group_retry', true, { shouldDirty: true })
      const nextStrategy = currentStrategy || 'smart'
      const ordered = computeStrategyGroupOrder(
        nextStrategy,
        groups,
        globalAutoGroups,
        maxAutoGroups
      )
      form.setValue('auto_groups', ordered, {
        shouldDirty: true,
        shouldValidate: true,
      })
      form.setValue('auto_groups_mode', 'custom', { shouldDirty: true })
    } else {
      const fallback =
        groups.find((g) => g.value === 'default')?.value ??
        availableAutoGroupNames[0] ??
        ''
      form.setValue('group', fallback, { shouldDirty: true })
      form.setValue('cross_group_retry', false, { shouldDirty: true })
      form.setValue('auto_groups', [], { shouldDirty: true })
      form.setValue('auto_groups_mode', 'inherit', { shouldDirty: true })
    }
  }

  const handleStrategyChange = (newStrategy: RoutingStrategy) => {
    form.setValue('routing_strategy', newStrategy, { shouldDirty: true })
    const ordered = computeStrategyGroupOrder(
      newStrategy,
      groups,
      globalAutoGroups,
      maxAutoGroups
    )
    form.setValue('auto_groups', ordered, {
      shouldDirty: true,
      shouldValidate: true,
    })
    form.setValue('auto_groups_mode', 'custom', { shouldDirty: true })
  }

  // Correct group after groups load: if the form value is not in available groups, fall back
  useEffect(() => {
    if (groups.length === 0) return
    const currentGroup = selectedGroup
    if (currentGroup && !groups.some((g) => g.value === currentGroup)) {
      const fallback =
        groups.find((g) => g.value === 'default')?.value ??
        groups[0]?.value ??
        ''
      form.setValue('group', fallback)
      if (currentGroup === 'auto') {
        form.setValue('auto_groups', [])
        form.setValue('auto_groups_mode', 'inherit')
        form.setValue('cross_group_retry', false)
      }
    }
  }, [groups, form, selectedGroup])

  const onSubmit = async (data: ApiKeyFormValues) => {
    setIsSubmitting(true)
    try {
      const basePayload = transformFormDataToPayload(data)

      if (isUpdate && currentRow) {
        const result = await updateApiKey({
          ...basePayload,
          id: currentRow.id,
        })
        if (result.success) {
          toast.success(t(SUCCESS_MESSAGES.API_KEY_UPDATED))
          onOpenChange(false)
          triggerRefresh()
        } else {
          toast.error(result.message || t(ERROR_MESSAGES.UPDATE_FAILED))
        }
      } else {
        // Create mode - handle batch creation
        const count = data.tokenCount || 1
        let successCount = 0
        let newKey: string | null = null

        for (let i = 0; i < count; i++) {
          const result = await createApiKey({
            ...basePayload,
            name:
              i === 0 && data.name
                ? data.name
                : `${data.name || 'default'}-${Math.random().toString(36).slice(2, 8)}`,
          })
          if (result.success) {
            successCount++
            const returnedKey = (result as { data?: { key?: string } }).data?.key
            if (returnedKey) {
              newKey = returnedKey
            }
          } else {
            toast.error(result.message || t(ERROR_MESSAGES.CREATE_FAILED))
            break
          }
        }

        if (successCount > 0) {
          toast.success(
            t('Successfully created {{count}} API Key(s)', {
              count: successCount,
            })
          )
          // Refresh the table behind the drawer, then show the success guide
          triggerRefresh()
          setCreatedCount(successCount)
          setCreatedKey(newKey)
        }
      }
    } catch {
      toast.error(t(ERROR_MESSAGES.UNEXPECTED))
    } finally {
      setIsSubmitting(false)
    }
  }

  const onInvalid: SubmitErrorHandler<ApiKeyFormValues> = () => {
    toast.error(t('Please fix the highlighted fields before saving'))
  }

  const handleSetExpiry = (months: number, days: number, hours: number) => {
    if (months === 0 && days === 0 && hours === 0) {
      form.setValue('expired_time', undefined)
      return
    }

    const now = new Date()
    now.setMonth(now.getMonth() + months)
    now.setDate(now.getDate() + days)
    now.setHours(now.getHours() + hours)

    form.setValue('expired_time', now)
  }

  const { meta: currencyMeta } = getCurrencyDisplay()
  const currencyLabel = getCurrencyLabel()
  const tokensOnly = currencyMeta.kind === 'tokens'
  const quotaLabel = t('Quota ({{currency}})', { currency: currencyLabel })
  const quotaPlaceholder = tokensOnly
    ? t('Enter quota in tokens')
    : t('Enter quota in {{currency}}', { currency: currencyLabel })
  const autoGroupsMode = form.watch('auto_groups_mode')
  const unlimitedQuota = form.watch('unlimited_quota')

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) {
          form.reset()
          setCreatedCount(null)
          setCreatedKey(null)
        }
      }}
    >
      <SheetContent
        className={sideDrawerContentClassName('max-w-none sm:!max-w-[620px]')}
      >
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>
            {isUpdate ? t('Update API Key') : t('Create API Key')}
          </SheetTitle>
          <SheetDescription>
            {isUpdate
              ? t('Update the API key by providing necessary info.')
              : t('Add a new API key by providing necessary info.')}
          </SheetDescription>
        </SheetHeader>
        {createdCount !== null && (
          <div className='flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center'>
            <span className='bg-success/10 text-success flex size-12 shrink-0 items-center justify-center rounded-full border border-success/30'>
              <Check className='size-6' aria-hidden='true' />
            </span>
            <div className='text-base font-semibold'>
              {t('Successfully created {{count}} API Key(s)', {
                count: createdCount,
              })}
            </div>
            {createdKey ? (
              <div className='w-full max-w-md rounded-xl border bg-muted/40 p-4 text-left'>
                <div className='mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground'>
                  <span>{t('Your API Key')}</span>
                  <span className='text-[11px] font-semibold text-amber-500'>
                    {t('Please copy and save now')}
                  </span>
                </div>
                <div className='flex items-center gap-2'>
                  <code className='bg-background flex-1 break-all rounded border px-2.5 py-1.5 font-mono text-xs select-all'>
                    {createdKey.startsWith('sk-') ? createdKey : `sk-${createdKey}`}
                  </code>
                  <Button
                    size='sm'
                    variant='outline'
                    className='h-8 shrink-0 gap-1.5'
                    onClick={() => {
                      const full = createdKey.startsWith('sk-')
                        ? createdKey
                        : `sk-${createdKey}`
                      void navigator.clipboard.writeText(full)
                      toast.success(t('API Key copied to clipboard'))
                    }}
                  >
                    <Copy className='size-3.5' />
                    {t('Copy')}
                  </Button>
                </div>
              </div>
            ) : (
              <p className='text-muted-foreground max-w-sm text-sm leading-relaxed'>
                {t(
                  'The full key is not shown here. Click the key column in the table below to view or copy it.'
                )}
              </p>
            )}
            <Button
              variant='outline'
              onClick={() => onOpenChange(false)}
              className='w-full sm:w-auto'
            >
              <KeyRound data-icon='inline-start' />
              {t('View in API Keys table')}
            </Button>
          </div>
        )}
        <Form {...form}>
          <form
            id='api-key-form'
            onSubmit={form.handleSubmit(onSubmit, onInvalid)}
            aria-busy={!isFormInitialized}
            inert={!isFormInitialized || isSubmitting ? true : undefined}
            className={cn(
              sideDrawerFormClassName('gap-5'),
              createdCount !== null && 'hidden'
            )}
          >
            <SideDrawerSection>
              <SideDrawerSectionHeader
                title={t('Basic Information')}
                description={t('Set API key basic information')}
                icon={<KeyRound className='size-4' />}
                iconTone='info'
              />
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Name')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t('Enter a name')} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 智能路由 Switch & Strategies (OpenLux Layout) */}
              <div
                data-slot='smart-routing-card'
                className='border-border/70 bg-card/60 flex flex-col gap-3 rounded-xl border p-3.5 shadow-2xs'
              >
                <div className='flex items-center justify-between gap-3'>
                  <div className='flex items-center gap-1.5'>
                    <span className='text-destructive text-sm font-bold'>*</span>
                    <span className='text-foreground text-sm font-semibold'>
                      {t('Smart Routing')}
                    </span>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span
                            role='button'
                            tabIndex={0}
                            className='text-muted-foreground hover:text-foreground inline-flex size-4 cursor-pointer items-center justify-center rounded-full transition-colors'
                            aria-label={t('Smart Routing description')}
                          />
                        }
                      >
                        <Info className='size-3.5' />
                      </TooltipTrigger>
                      <TooltipContent className='max-w-xs text-xs'>
                        {t('Smart Routing description')}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Switch
                    checked={isSmartRouting}
                    onCheckedChange={handleToggleSmartRouting}
                    aria-label={t('Smart Routing')}
                  />
                </div>

                {isSmartRouting && (
                  <div className='flex flex-col gap-3 pt-1'>
                    <RadioGroup
                      value={currentStrategy}
                      onValueChange={(val) =>
                        handleStrategyChange(val as RoutingStrategy)
                      }
                      className='grid grid-cols-1 gap-2 sm:grid-cols-2'
                    >
                      {ROUTING_STRATEGIES.map((item) => {
                        const isSelected = currentStrategy === item.value
                        return (
                          <label
                            key={item.value}
                            htmlFor={`strategy-${item.value}`}
                            className={cn(
                              'border-border/60 hover:bg-muted/40 text-foreground flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-xs transition-all select-none',
                              isSelected &&
                                'border-primary/60 bg-primary/10 text-primary font-medium shadow-2xs'
                            )}
                          >
                            <RadioGroupItem
                              value={item.value}
                              id={`strategy-${item.value}`}
                            />
                            <div className='flex flex-wrap items-baseline gap-1'>
                              <span className='font-medium'>{t(item.label)}</span>
                              <span
                                className={cn(
                                  'text-[11px]',
                                  isSelected
                                    ? 'text-primary/80'
                                    : 'text-muted-foreground'
                                )}
                              >
                                {t(item.subLabel)}
                              </span>
                            </div>
                          </label>
                        )
                      })}
                    </RadioGroup>

                    <div className='border-rose-200 bg-rose-50/80 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/25 dark:text-rose-400 flex items-start gap-2 rounded-lg border p-3 text-xs leading-relaxed'>
                      <span>{t('Smart Routing Active Banner')}</span>
                    </div>
                  </div>
                )}
              </div>

              <FormField
                control={form.control}
                name='group'
                render={({ field }) => (
                  <FormItem>
                    <div className='flex items-center gap-1.5'>
                      <FormLabel>{t('Group')}</FormLabel>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span
                              role='button'
                              tabIndex={0}
                              className='text-muted-foreground hover:text-foreground inline-flex size-3.5 cursor-pointer items-center justify-center rounded-full transition-colors'
                              aria-label={t('Group')}
                            />
                          }
                        >
                          <Info className='size-3' />
                        </TooltipTrigger>
                        <TooltipContent className='max-w-xs text-xs'>
                          {isSmartRouting
                            ? t('Smart routing overrides group selection')
                            : t(
                                'Groups that users can select when creating API keys.'
                              )}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <FormControl>
                      <ApiKeyGroupCombobox
                        options={groups}
                        value={field.value}
                        onValueChange={(group) => {
                          field.onChange(group)
                          if (group === 'auto') {
                            form.setValue('cross_group_retry', true, {
                              shouldDirty: true,
                            })
                            return
                          }
                          form.setValue('cross_group_retry', false, {
                            shouldDirty: true,
                          })
                        }}
                        placeholder={t('Select a group')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isSmartRouting && (
                <FormField
                  control={form.control}
                  name='auto_groups'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Auto group order')}</FormLabel>
                      <FormDescription>
                        {t(
                          'Choose and order the groups this API key will try.'
                        )}
                      </FormDescription>
                      <FormControl>
                        <AutoGroupOrderEditor
                          value={field.value}
                          mode={autoGroupsMode}
                          options={groups}
                          globalOptions={globalAutoGroupOptions}
                          maxCount={maxAutoGroups}
                          onChange={(value) => {
                            form.setValue('auto_groups_mode', value.mode, {
                              shouldDirty: true,
                              shouldValidate: false,
                            })
                            form.setValue(
                              'auto_groups',
                              value.groups.slice(0, maxAutoGroups),
                              {
                                shouldDirty: true,
                                shouldValidate: true,
                              }
                            )
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isSmartRouting && (
                <FormField
                  control={form.control}
                  name='cross_group_retry'
                  render={({ field }) => (
                    <FormItem className={sideDrawerSwitchItemClassName()}>
                      <div className='flex flex-col gap-0.5'>
                        <FormLabel className='text-sm'>
                          {t('Cross-group retry')}
                        </FormLabel>
                        <FormDescription className='line-clamp-2 text-xs sm:line-clamp-none'>
                          {t(
                            'When enabled, if channels in the current group fail, it will try channels in the next group in order.'
                          )}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={!!field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name='expired_time'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Expiration Time')}</FormLabel>
                    <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'>
                      <FormControl>
                        <DateTimePicker
                          value={field.value}
                          onChange={field.onChange}
                          placeholder={t('Never expires')}
                          className='min-w-0 [&_input[type=time]]:w-24 sm:[&_input[type=time]]:w-32'
                        />
                      </FormControl>
                      <div className='grid grid-cols-4 gap-2 sm:flex'>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='px-2 text-xs sm:px-3 sm:text-sm'
                          onClick={() => handleSetExpiry(0, 0, 0)}
                        >
                          {t('Never')}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='px-2 text-xs sm:px-3 sm:text-sm'
                          onClick={() => handleSetExpiry(1, 0, 0)}
                        >
                          {t('1 Month')}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='px-2 text-xs sm:px-3 sm:text-sm'
                          onClick={() => handleSetExpiry(0, 1, 0)}
                        >
                          {t('1 Day')}
                        </Button>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          className='px-2 text-xs sm:px-3 sm:text-sm'
                          onClick={() => handleSetExpiry(0, 0, 1)}
                        >
                          {t('1 Hour')}
                        </Button>
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!isUpdate && (
                <FormField
                  control={form.control}
                  name='tokenCount'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Quantity')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='number'
                          min='1'
                          placeholder={t('Number of keys to create')}
                          onChange={(e) =>
                            field.onChange(
                              Number.parseInt(e.target.value, 10) || 1
                            )
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          'Create multiple API keys at once (random suffix will be added to names)'
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </SideDrawerSection>

            <SideDrawerSection>
              <SideDrawerSectionHeader
                title={t('Quota Settings')}
                description={t('Set quota amount and limits')}
                icon={<WalletCards className='size-4' />}
                iconTone='success'
              />
              {!unlimitedQuota && (
                <FormField
                  control={form.control}
                  name='remain_quota_dollars'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{quotaLabel}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='number'
                          step={tokensOnly ? 1 : 0.01}
                          placeholder={quotaPlaceholder}
                          onChange={(e) =>
                            field.onChange(
                              Number.parseFloat(e.target.value) || 0
                            )
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        {tokensOnly
                          ? t('Enter the quota amount in tokens')
                          : t('Enter the quota amount in {{currency}}', {
                              currency: currencyLabel,
                            })}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name='unlimited_quota'
                render={({ field }) => (
                  <FormItem className={sideDrawerSwitchItemClassName()}>
                    <div className='flex flex-col gap-0.5'>
                      <FormLabel className='text-sm'>
                        {t('Unlimited Quota')}
                      </FormLabel>
                      <FormDescription className='text-xs'>
                        {t('Enable unlimited quota for this API key')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </SideDrawerSection>

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <SideDrawerSection>
                <CollapsibleTrigger
                  render={
                    <button
                      type='button'
                      className='hover:bg-muted/40 flex w-full items-center gap-3 rounded-md py-1.5 text-left transition-colors'
                    />
                  }
                >
                  <SideDrawerSectionHeader
                    className='flex-1'
                    title={t('Advanced Settings')}
                    description={t('Set API key access restrictions')}
                    icon={<Settings2 className='size-4' />}
                  />
                  <ChevronDown
                    className={cn(
                      'text-muted-foreground size-4 shrink-0 transition-transform',
                      advancedOpen && 'rotate-180'
                    )}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className='flex flex-col gap-4 pt-2'>
                    <FormField
                      control={form.control}
                      name='model_limits'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('Model Limits')}</FormLabel>
                          <FormControl>
                            <MultiSelect
                              options={models.map((m) => ({
                                label: m,
                                value: m,
                              }))}
                              selected={field.value}
                              onChange={field.onChange}
                              placeholder={t(
                                'Select models (empty for allow all)'
                              )}
                            />
                          </FormControl>
                          <FormDescription>
                            {t('Limit which models can be used with this key')}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='allow_ips'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t('IP Whitelist (supports CIDR)')}
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              className='min-h-20 resize-none'
                              placeholder={t(
                                'One IP per line (empty for no restriction)'
                              )}
                              rows={3}
                            />
                          </FormControl>
                          <FormDescription>
                            {t(
                              'Do not over-trust this feature. IP may be spoofed. Please use with nginx, CDN and other gateways.'
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CollapsibleContent>
              </SideDrawerSection>
            </Collapsible>
          </form>
        </Form>
        <SheetFooter className={sideDrawerFooterClassName()}>
          {createdCount !== null ? (
            <Button
              onClick={() => onOpenChange(false)}
              className='w-full sm:w-auto'
            >
              {t('Done')}
            </Button>
          ) : (
            <>
              <SheetClose
                render={
                  <Button variant='outline' className='w-full sm:w-auto' />
                }
              >
                {t('Close')}
              </SheetClose>
              <Button
                type='button'
                onClick={form.handleSubmit(onSubmit, onInvalid)}
                disabled={!isFormInitialized || isSubmitting}
                className='w-full sm:w-auto'
              >
                {isSubmitting ? t('Saving...') : t('Save changes')}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
