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
import { createInstance } from 'i18next'
import { describe, expect, test } from 'vitest'

import en from '../locales/en.json'
import fr from '../locales/fr.json'
import ja from '../locales/ja.json'
import ru from '../locales/ru.json'
import vi from '../locales/vi.json'
import zhTW from '../locales/zh-TW.json'
import zh from '../locales/zh.json'

const signupNotice =
  'Username registration does not bind an email. Save your password. Email recovery requires a verified email bound in account settings; otherwise contact support. You can also register with an available sign-in provider.'
const recoveryNotice =
  'Email password reset is currently unavailable. If you use Google, sign in with Google. Accounts without a bound email need help from support.'
const contractNotice =
  'Use the model-specific request and polling paths below. Endpoint formats alone do not describe a model capability.'

const locales = [
  ['zhCN', zh, '用户名注册不会绑定邮箱'],
  ['zhTW', zhTW, '使用者名稱註冊不會綁定信箱'],
  ['fr', fr, 'L’inscription par nom d’utilisateur'],
  ['ru', ru, 'Регистрация по имени'],
  ['ja', ja, 'ユーザー名で登録するとメールは紐付きません'],
  ['vi', vi, 'Đăng ký bằng tên người dùng không liên kết email'],
] as const

describe('public interface translations', () => {
  test.each(locales)(
    '%s renders the signup recovery warning in the selected language',
    async (language, dictionary, expectedText) => {
      const instance = createInstance()
      await instance.init({
        resources: { en, [language]: dictionary },
        lng: language,
        fallbackLng: 'en',
        nsSeparator: false,
      })

      expect(instance.t(signupNotice)).toContain(expectedText)
      expect(instance.t(recoveryNotice)).not.toBe(recoveryNotice)
      expect(instance.t('Help and support')).not.toBe('Help and support')
      expect(instance.t(contractNotice)).not.toBe(contractNotice)
      expect(
        instance.t('Billing method not confirmed. Contact support.')
      ).not.toBe('Billing method not confirmed. Contact support.')
      expect(instance.t('The model catalog could not be loaded')).not.toBe(
        'The model catalog could not be loaded'
      )
    }
  )

  test('keeps all interface strings inside the translation namespace read by the locale loader', () => {
    for (const dictionary of [en, zh, zhTW, fr, ru, ja, vi]) {
      expect(Object.keys(dictionary)).toEqual(['translation'])
    }
  })
})
