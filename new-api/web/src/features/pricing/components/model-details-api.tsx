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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BundledLanguage } from 'shiki/bundle/web'

import {
  CodeBlock,
  CodeBlockCopyButton,
} from '@/components/ai-elements/code-block'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import {
  buildRequestSample,
  getExampleFields,
  getModelRequests,
  type SampleLanguage,
} from '../lib/model-api-contracts'
import type { PricingModel } from '../types'

const LANGUAGES: Record<
  SampleLanguage,
  { label: string; highlight: BundledLanguage }
> = {
  curl: { label: 'cURL', highlight: 'bash' },
  python: { label: 'Python', highlight: 'python' },
  typescript: { label: 'TypeScript', highlight: 'typescript' },
  javascript: { label: 'JavaScript', highlight: 'javascript' },
}

export function ModelDetailsApi(props: {
  model: PricingModel
  endpointMap: Record<string, { path?: string; method?: string }>
}) {
  const { t, i18n } = useTranslation()
  const [requestIndex, setRequestIndex] = useState('0')
  const [lang, setLang] = useState<SampleLanguage>('curl')
  const requests = useMemo(() => {
    const supported = Object.fromEntries(
      (props.model.supported_endpoint_types || [])
        .map((type) => [type, props.endpointMap[type]])
        .filter(([, value]) => Boolean(value))
    )
    return getModelRequests(props.model.model_name, supported)
  }, [
    props.model.model_name,
    props.model.supported_endpoint_types,
    props.endpointMap,
  ])
  const request = requests[Number(requestIndex)] || requests[0]
  const baseUrl =
    typeof window === 'undefined'
      ? 'https://www.keyoapi.xyz'
      : window.location.origin
  const handbook = i18n.language.startsWith('zh')
    ? '/brand/keyo-api-ref.md'
    : '/brand/keyo-api-ref.en.md'
  const fields = request ? getExampleFields(request) : []

  return (
    <div className='space-y-6'>
      <section>
        <h2 className='mb-3 text-sm font-semibold'>{t('Code samples')}</h2>
        <p className='text-muted-foreground mb-3 text-sm'>
          {t(
            'Use the model-specific request and polling paths below. Endpoint formats alone do not describe a model capability.'
          )}
        </p>
        <a
          href={handbook}
          target='_blank'
          rel='noreferrer'
          className='text-primary text-sm underline underline-offset-4'
        >
          {t('Open the full integration handbook')}
        </a>
        {!request && (
          <p
            role='status'
            className='bg-muted/30 mt-4 rounded-lg border p-4 text-sm'
          >
            {t(
              'A verified example for this model is not available on this page. Use the model-specific handbook or contact support before submitting a request.'
            )}
          </p>
        )}
        {request && (
          <>
            <div className='mt-4 flex flex-wrap items-center gap-2'>
              {requests.length > 1 && (
                <Tabs
                  value={requests[Number(requestIndex)] ? requestIndex : '0'}
                  onValueChange={setRequestIndex}
                >
                  <TabsList
                    aria-label={t('API endpoint')}
                    className='h-auto flex-wrap'
                  >
                    {requests.map((item, index) => (
                      <TabsTrigger
                        key={item.path}
                        value={String(index)}
                        className='text-xs'
                      >
                        {item.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}
              <Tabs
                value={lang}
                onValueChange={(value) => setLang(value as SampleLanguage)}
                className='ml-auto'
              >
                <TabsList aria-label={t('Programming language')}>
                  {(Object.keys(LANGUAGES) as SampleLanguage[]).map(
                    (language) => (
                      <TabsTrigger key={language} value={language}>
                        {LANGUAGES[language].label}
                      </TabsTrigger>
                    )
                  )}
                </TabsList>
              </Tabs>
            </div>
            <p className='text-muted-foreground my-3 text-xs'>
              {t(
                'Set NEW_API_KEY to your API key before running. Python examples require requests; JavaScript and TypeScript examples use Node.js 20 or later.'
              )}
            </p>
            <CodeBlock
              code={buildRequestSample(lang, request, baseUrl)}
              language={LANGUAGES[lang].highlight}
            >
              <CodeBlockCopyButton />
            </CodeBlock>
            {request.noteKey && (
              <p className='text-muted-foreground mt-3 text-sm'>
                {t(request.noteKey)}
              </p>
            )}
            {request.pollPath && (
              <div className='mt-4 space-y-3'>
                <h3 className='text-sm font-semibold'>{t('Query task')}</h3>
                <p className='text-muted-foreground text-sm'>
                  {t(
                    'Task creation is not completion. Save the returned id or task_id, set TASK_ID to that value, and query this exact path until the task succeeds or fails. Read the handbook for status and result fields. Do not resubmit a request whose outcome is unknown.'
                  )}
                </p>
                <CodeBlock
                  code={buildRequestSample(
                    lang,
                    {
                      label: 'Query task',
                      path: request.pollPath,
                      method: 'GET',
                    },
                    baseUrl
                  )}
                  language={LANGUAGES[lang].highlight}
                >
                  <CodeBlockCopyButton />
                </CodeBlock>
              </div>
            )}
            {fields.length > 0 && (
              <section className='mt-5'>
                <h3 className='mb-2 text-sm font-semibold'>
                  {t('Example request fields')}
                </h3>
                <p className='text-muted-foreground mb-3 text-xs'>
                  {t(
                    'These fields describe the example above. The handbook lists required fields, optional settings, and model-specific limits.'
                  )}
                </p>
                <div className='overflow-x-auto rounded-lg border'>
                  <table className='w-full text-left text-sm'>
                    <thead className='bg-muted/30'>
                      <tr>
                        <th className='p-3'>{t('Parameter')}</th>
                        <th className='p-3'>{t('Type')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((field) => (
                        <tr key={field.name} className='border-t'>
                          <td className='p-3 font-mono'>{field.name}</td>
                          <td className='p-3'>{field.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </section>
      <section>
        <h2 className='mb-2 text-sm font-semibold'>{t('Authentication')}</h2>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Create an API key in the console. The examples show the authentication header for the selected endpoint; keep your key private.'
          )}
        </p>
      </section>
      <section>
        <h2 className='mb-2 text-sm font-semibold'>{t('Rate limits')}</h2>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Rate limits depend on your account and model configuration. No verified numerical limits are published here. If a request returns 429, follow Retry-After when provided and reduce concurrency.'
          )}
        </p>
      </section>
    </div>
  )
}
