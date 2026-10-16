package controller

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

type TrackEventPayload struct {
	VisitorId   string `json:"visitor_id"`
	SessionId   string `json:"session_id"`
	Country     string `json:"country"`
	Path        string `json:"path"`
	Title       string `json:"title"`
	Referrer    string `json:"referrer"`
	UtmSource   string `json:"utm_source"`
	UtmMedium   string `json:"utm_medium"`
	UtmCampaign string `json:"utm_campaign"`
	EventName   string `json:"event_name"`
	EventData   any    `json:"event_data"`
	Timestamp   int64  `json:"timestamp"`
}

// RecordTrackEvent receives client tracking beacons
func RecordTrackEvent(c *gin.Context) {
	var payload TrackEventPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userId := c.GetInt("id")
	clientIp := c.ClientIP()

	country := strings.TrimSpace(payload.Country)
	if country == "" || country == "UNKNOWN" {
		// Fallback check on headers if available
		cfCountry := c.GetHeader("CF-IPCountry")
		if cfCountry != "" {
			country = strings.ToUpper(cfCountry)
		} else {
			country = "UNKNOWN"
		}
	}

	var eventDataStr string
	if payload.EventData != nil {
		switch v := payload.EventData.(type) {
		case string:
			eventDataStr = v
		default:
			bytes, _ := json.Marshal(v)
			eventDataStr = string(bytes)
		}
	}

	createdAt := payload.Timestamp
	if createdAt == 0 {
		createdAt = time.Now().Unix()
	}

	event := model.AnalyticsEvent{
		VisitorId:   payload.VisitorId,
		SessionId:   payload.SessionId,
		UserId:      userId,
		Country:     country,
		EventName:   payload.EventName,
		Path:        payload.Path,
		Title:       payload.Title,
		Referrer:    payload.Referrer,
		UtmSource:   payload.UtmSource,
		UtmMedium:   payload.UtmMedium,
		UtmCampaign: payload.UtmCampaign,
		EventData:   eventDataStr,
		ClientIp:    clientIp,
		CreatedAt:   createdAt,
	}

	_ = model.RecordAnalyticsEvent(&event)
	c.JSON(http.StatusOK, gin.H{"success": true})
}

type GeoStatRow struct {
	Country   string `json:"country"`
	Visitors  int64  `json:"visitors"`
	Pageviews int64  `json:"pageviews"`
}

type ExitPageRow struct {
	Path    string `json:"path"`
	Country string `json:"country"`
	Count   int64  `json:"count"`
}

type SourceStatRow struct {
	Source   string `json:"source"`
	Visitors int64  `json:"visitors"`
}

type GiftDialogFunnel struct {
	Shown     int64 `json:"shown"`
	Copied    int64 `json:"copied"`
	Dismissed int64 `json:"dismissed"`
	Wallet    int64 `json:"wallet"`
}

// GetBehaviorStats returns country breakdown, exit pages, and welcome dialog funnel
func GetBehaviorStats(c *gin.Context) {
	var geoRows []GeoStatRow
	model.DB.Raw(`
		SELECT country, COUNT(DISTINCT visitor_id) AS visitors, COUNT(*) AS pageviews
		FROM analytics_events
		WHERE event_name = 'page_view'
		GROUP BY country
		ORDER BY visitors DESC
		LIMIT 20
	`).Scan(&geoRows)

	var exitRows []ExitPageRow
	model.DB.Raw(`
		SELECT path, country, COUNT(*) AS count
		FROM analytics_events
		WHERE event_name = 'page_leave'
		GROUP BY path, country
		ORDER BY count DESC
		LIMIT 20
	`).Scan(&exitRows)

	var sourceRows []SourceStatRow
	model.DB.Raw(`
		SELECT CASE WHEN utm_source != '' THEN utm_source ELSE 'Direct / Organic' END AS source,
		       COUNT(DISTINCT visitor_id) AS visitors
		FROM analytics_events
		GROUP BY source
		ORDER BY visitors DESC
		LIMIT 15
	`).Scan(&sourceRows)

	var funnel GiftDialogFunnel
	model.DB.Raw(`SELECT COUNT(*) FROM analytics_events WHERE event_name = 'gift_welcome_shown'`).Scan(&funnel.Shown)
	model.DB.Raw(`SELECT COUNT(*) FROM analytics_events WHERE event_name = 'gift_welcome_copy_curl'`).Scan(&funnel.Copied)
	model.DB.Raw(`SELECT COUNT(*) FROM analytics_events WHERE event_name = 'gift_welcome_dismiss'`).Scan(&funnel.Dismissed)
	model.DB.Raw(`SELECT COUNT(*) FROM analytics_events WHERE event_name = 'gift_welcome_view_wallet'`).Scan(&funnel.Wallet)

	var recentEvents []model.AnalyticsEvent
	model.DB.Order("created_at DESC").Limit(30).Find(&recentEvents)

	common.ApiSuccess(c, gin.H{
		"geo":            geoRows,
		"exit_pages":     exitRows,
		"sources":        sourceRows,
		"dialog_funnel":  funnel,
		"recent_events":  recentEvents,
	})
}
