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
export type FunnelSummary = {
  registered: number
  with_request: number
  key_users: number
  consume_users: number
  paid_users: number
  paid_money: number
}

export type FunnelPayStatusRow = {
  status: string
  count: number
  money: number
}

export type FunnelDailyRow = {
  date: string
  new_users: number
  consume_requests: number
  top_ups: number
  paid_money: number
}

export type FunnelRecentTopUp = {
  id: number
  username: string
  email: string
  amount: number
  money: number
  status: string
  payment_method: string
  payment_provider: string
  create_time: number
}

export type FunnelStatsPayload = {
  funnel: FunnelSummary
  pay_status: FunnelPayStatusRow[]
  daily: FunnelDailyRow[]
  recent_topups: FunnelRecentTopUp[]
}

export type FunnelStatsResponse = {
  success: boolean
  message?: string
  data?: FunnelStatsPayload
}
