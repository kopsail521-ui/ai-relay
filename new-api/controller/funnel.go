package controller

import (
	"sort"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

const (
	funnelDailyWindowDays = 30
	funnelRecentTopUps    = 20
)

type FunnelSummary struct {
	Registered   int64   `json:"registered"`
	WithRequest  int64   `json:"with_request"`
	KeyUsers     int64   `json:"key_users"`
	ConsumeUsers int64   `json:"consume_users"`
	PaidUsers    int64   `json:"paid_users"`
	PaidMoney    float64 `json:"paid_money"`
}

type FunnelPayStatusRow struct {
	Status string  `json:"status"`
	Count  int64   `json:"count"`
	Money  float64 `json:"money"`
}

type FunnelDailyRow struct {
	Date            string  `json:"date"`
	NewUsers        int64   `json:"new_users"`
	ConsumeRequests int64   `json:"consume_requests"`
	TopUps          int64   `json:"top_ups"`
	PaidMoney       float64 `json:"paid_money"`
}

type FunnelRecentTopUp struct {
	Id              int     `json:"id"`
	Username        string  `json:"username"`
	Email           string  `json:"email"`
	Amount          int64   `json:"amount"`
	Money           float64 `json:"money"`
	Status          string  `json:"status"`
	PaymentMethod   string  `json:"payment_method"`
	PaymentProvider string  `json:"payment_provider"`
	CreateTime      int64   `json:"create_time"`
}

type FunnelStatsData struct {
	Funnel       FunnelSummary        `json:"funnel"`
	PayStatus    []FunnelPayStatusRow `json:"pay_status"`
	Daily        []FunnelDailyRow     `json:"daily"`
	RecentTopUps []FunnelRecentTopUp  `json:"recent_topups"`
}

func funnelDayKey(ts int64) string {
	return time.Unix(ts, 0).Format("2006-01-02")
}

func scanCount(query string, args ...any) (int64, error) {
	var n int64
	err := model.DB.Raw(query, args...).Scan(&n).Error
	return n, err
}

// GetFunnelStats returns admin conversion-funnel aggregates: registration,
// key activation, API consumption and payment, plus 30-day daily trends.
// All SQL is dialect-portable; day bucketing happens in Go.
func GetFunnelStats(c *gin.Context) {
	var summary FunnelSummary
	var err error

	summary.Registered, err = scanCount("SELECT COUNT(*) FROM users WHERE deleted_at IS NULL")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	summary.WithRequest, err = scanCount("SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND request_count > 0")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	summary.KeyUsers, err = scanCount("SELECT COUNT(DISTINCT user_id) FROM tokens")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	summary.ConsumeUsers, err = scanCount("SELECT COUNT(DISTINCT user_id) FROM logs WHERE type = 2")
	if err != nil {
		common.ApiError(c, err)
		return
	}

	var paid struct {
		Users int64   `gorm:"column:users"`
		Money float64 `gorm:"column:money"`
	}
	err = model.DB.Raw(
		"SELECT COUNT(DISTINCT user_id) AS users, COALESCE(SUM(money), 0) AS money "+
			"FROM top_ups WHERE status IN ('success', 'completed', 'paid')",
	).Scan(&paid).Error
	if err != nil {
		common.ApiError(c, err)
		return
	}
	summary.PaidUsers = paid.Users
	summary.PaidMoney = paid.Money

	var payStatusRows []FunnelPayStatusRow
	err = model.DB.Raw(
		"SELECT status, COUNT(*) AS count, COALESCE(SUM(money), 0) AS money " +
			"FROM top_ups GROUP BY status",
	).Scan(&payStatusRows).Error
	if err != nil {
		common.ApiError(c, err)
		return
	}
	sort.Slice(payStatusRows, func(i, j int) bool {
		return payStatusRows[i].Count > payStatusRows[j].Count
	})

	since := common.GetTimestamp() - funnelDailyWindowDays*86400
	daily := make([]FunnelDailyRow, 0, funnelDailyWindowDays)
	dayIndex := make(map[string]*FunnelDailyRow, funnelDailyWindowDays)
	today := time.Now()
	for i := funnelDailyWindowDays - 1; i >= 0; i-- {
		date := today.AddDate(0, 0, -i).Format("2006-01-02")
		row := FunnelDailyRow{Date: date}
		daily = append(daily, row)
		dayIndex[date] = &daily[len(daily)-1]
	}

	var userTimes []int64
	err = model.DB.Raw(
		"SELECT created_at FROM users WHERE deleted_at IS NULL AND created_at >= ?",
		since,
	).Scan(&userTimes).Error
	if err != nil {
		common.ApiError(c, err)
		return
	}
	for _, ts := range userTimes {
		if row := dayIndex[funnelDayKey(ts)]; row != nil {
			row.NewUsers++
		}
	}

	var consumeTimes []int64
	err = model.DB.Raw(
		"SELECT created_at FROM logs WHERE type = 2 AND created_at >= ?",
		since,
	).Scan(&consumeTimes).Error
	if err != nil {
		common.ApiError(c, err)
		return
	}
	for _, ts := range consumeTimes {
		if row := dayIndex[funnelDayKey(ts)]; row != nil {
			row.ConsumeRequests++
		}
	}

	var topUpTimes []struct {
		CreateTime int64   `gorm:"column:create_time"`
		Money      float64 `gorm:"column:money"`
		Status     string  `gorm:"column:status"`
	}
	err = model.DB.Raw(
		"SELECT create_time, money, status FROM top_ups WHERE create_time >= ?",
		since,
	).Scan(&topUpTimes).Error
	if err != nil {
		common.ApiError(c, err)
		return
	}
	for _, t := range topUpTimes {
		row := dayIndex[funnelDayKey(t.CreateTime)]
		if row == nil {
			continue
		}
		row.TopUps++
		switch t.Status {
		case "success", "completed", "paid":
			row.PaidMoney += t.Money
		}
	}

	var recentTopUps []FunnelRecentTopUp
	err = model.DB.Raw(
		"SELECT t.id, COALESCE(u.username, '') AS username, COALESCE(u.email, '') AS email, "+
			"t.amount, t.money, t.status, COALESCE(t.payment_method, '') AS payment_method, "+
			"COALESCE(t.payment_provider, '') AS payment_provider, t.create_time "+
			"FROM top_ups t LEFT JOIN users u ON u.id = t.user_id "+
			"ORDER BY t.create_time DESC LIMIT ?",
		funnelRecentTopUps,
	).Scan(&recentTopUps).Error
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if recentTopUps == nil {
		recentTopUps = []FunnelRecentTopUp{}
	}
	if payStatusRows == nil {
		payStatusRows = []FunnelPayStatusRow{}
	}

	common.ApiSuccess(c, FunnelStatsData{
		Funnel:       summary,
		PayStatus:    payStatusRows,
		Daily:        daily,
		RecentTopUps: recentTopUps,
	})
}
