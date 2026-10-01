package model

import "github.com/QuantumNous/new-api/common"

// MigrateAffQuotaToGift moves legacy pending invite rewards into gift_quota once.
// Existing paid quota is left untouched (treated as recharge balance).
func MigrateAffQuotaToGift() error {
	if DB == nil {
		return nil
	}
	result := DB.Exec(`
UPDATE users
SET gift_quota = gift_quota + aff_quota,
    aff_quota = 0
WHERE aff_quota > 0`)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected > 0 {
		common.SysLog("migrated pending aff_quota into gift_quota")
	}
	return nil
}
