package model

import "time"

type AnalyticsEvent struct {
	Id          int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	VisitorId   string `json:"visitor_id" gorm:"type:varchar(64);index"`
	SessionId   string `json:"session_id" gorm:"type:varchar(64);index"`
	UserId      int    `json:"user_id" gorm:"index;default:0"`
	Country     string `json:"country" gorm:"type:varchar(16);index"`
	EventName   string `json:"event_name" gorm:"type:varchar(64);index"`
	Path        string `json:"path" gorm:"type:varchar(255);index"`
	Title       string `json:"title" gorm:"type:varchar(255)"`
	Referrer    string `json:"referrer" gorm:"type:varchar(512)"`
	UtmSource   string `json:"utm_source" gorm:"type:varchar(64);index"`
	UtmMedium   string `json:"utm_medium" gorm:"type:varchar(64)"`
	UtmCampaign string `json:"utm_campaign" gorm:"type:varchar(64)"`
	EventData   string `json:"event_data" gorm:"type:text"`
	ClientIp    string `json:"client_ip" gorm:"type:varchar(64)"`
	CreatedAt   int64  `json:"created_at" gorm:"index"`
}

func RecordAnalyticsEvent(event *AnalyticsEvent) error {
	if event == nil {
		return nil
	}
	if event.CreatedAt == 0 {
		event.CreatedAt = time.Now().Unix()
	}
	if event.Country == "" {
		event.Country = "UNKNOWN"
	}
	return DB.Create(event).Error
}
