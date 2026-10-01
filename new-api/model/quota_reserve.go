package model

import (
	"context"
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

type cacheQuotaResult int

const (
	cacheQuotaInsufficient cacheQuotaResult = iota
	cacheQuotaOK
	cacheQuotaMiss
)

const userQuotaReserveScript = `
if tonumber(redis.call('HGET', KEYS[1], 'Id') or '0') ~= tonumber(ARGV[2])
  or tonumber(redis.call('HGET', KEYS[1], 'CacheSchema') or '0') ~= tonumber(ARGV[3])
  or redis.call('HEXISTS', KEYS[1], 'Quota') == 0 then
  return -1
end
local quota = tonumber(redis.call('HGET', KEYS[1], 'Quota'))
if quota == nil or quota < tonumber(ARGV[1]) then
  return 0
end
redis.call('HINCRBY', KEYS[1], 'Quota', -tonumber(ARGV[1]))
return 1`

const userQuotaDeltaScript = `
if tonumber(redis.call('HGET', KEYS[1], 'Id') or '0') ~= tonumber(ARGV[2])
  or tonumber(redis.call('HGET', KEYS[1], 'CacheSchema') or '0') ~= tonumber(ARGV[3])
  or redis.call('HEXISTS', KEYS[1], 'Quota') == 0 then
  return -1
end
redis.call('HINCRBY', KEYS[1], 'Quota', tonumber(ARGV[1]))
return 1`

const userGiftQuotaDeltaScript = `
if tonumber(redis.call('HGET', KEYS[1], 'Id') or '0') ~= tonumber(ARGV[2])
  or tonumber(redis.call('HGET', KEYS[1], 'CacheSchema') or '0') ~= tonumber(ARGV[3])
  or redis.call('HEXISTS', KEYS[1], 'GiftQuota') == 0 then
  return -1
end
redis.call('HINCRBY', KEYS[1], 'GiftQuota', tonumber(ARGV[1]))
return 1`

// Prefer gift first, then paid. Returns giftUsed via positive return (>=0), or -1 miss / encoding.
// Return value: giftUsed + 1 when OK (so 0 gift → return 1); 0 = insufficient; -1 = miss.
const userWalletSplitReserveScript = `
if tonumber(redis.call('HGET', KEYS[1], 'Id') or '0') ~= tonumber(ARGV[2])
  or tonumber(redis.call('HGET', KEYS[1], 'CacheSchema') or '0') ~= tonumber(ARGV[3])
  or redis.call('HEXISTS', KEYS[1], 'Quota') == 0
  or redis.call('HEXISTS', KEYS[1], 'GiftQuota') == 0 then
  return -1
end
local amount = tonumber(ARGV[1])
local gift = tonumber(redis.call('HGET', KEYS[1], 'GiftQuota')) or 0
local paid = tonumber(redis.call('HGET', KEYS[1], 'Quota')) or 0
if gift + paid < amount then
  return 0
end
local fromGift = gift
if fromGift > amount then
  fromGift = amount
end
local fromPaid = amount - fromGift
if fromGift > 0 then
  redis.call('HINCRBY', KEYS[1], 'GiftQuota', -fromGift)
end
if fromPaid > 0 then
  redis.call('HINCRBY', KEYS[1], 'Quota', -fromPaid)
end
return fromGift + 1`

const tokenQuotaReserveScript = `
if tonumber(redis.call('HGET', KEYS[1], 'Id') or '0') ~= tonumber(ARGV[2])
  or redis.call('HEXISTS', KEYS[1], 'RemainQuota') == 0
  or redis.call('HEXISTS', KEYS[1], 'UsedQuota') == 0 then
  return -1
end
local remain = tonumber(redis.call('HGET', KEYS[1], 'RemainQuota'))
if remain == nil or remain < tonumber(ARGV[1]) then
  return 0
end
redis.call('HINCRBY', KEYS[1], 'RemainQuota', -tonumber(ARGV[1]))
redis.call('HINCRBY', KEYS[1], 'UsedQuota', tonumber(ARGV[1]))
redis.call('HSET', KEYS[1], 'AccessedTime', ARGV[3])
return 1`

const tokenQuotaDeltaScript = `
if tonumber(redis.call('HGET', KEYS[1], 'Id') or '0') ~= tonumber(ARGV[2])
  or redis.call('HEXISTS', KEYS[1], 'RemainQuota') == 0
  or redis.call('HEXISTS', KEYS[1], 'UsedQuota') == 0 then
  return -1
end
redis.call('HINCRBY', KEYS[1], 'RemainQuota', tonumber(ARGV[1]))
redis.call('HINCRBY', KEYS[1], 'UsedQuota', -tonumber(ARGV[1]))
redis.call('HSET', KEYS[1], 'AccessedTime', ARGV[3])
return 1`

func quotaResultFromLua(result int, err error) (cacheQuotaResult, error) {
	if err != nil {
		return cacheQuotaMiss, err
	}
	switch result {
	case 1:
		return cacheQuotaOK, nil
	case 0:
		return cacheQuotaInsufficient, nil
	default:
		return cacheQuotaMiss, nil
	}
}

func cacheTryReserveUserQuota(userID int, amount int64) (cacheQuotaResult, error) {
	result, err := common.RDB.Eval(context.Background(), userQuotaReserveScript,
		[]string{getUserCacheKey(userID)}, amount, userID, userCacheSchemaVersion).Int()
	return quotaResultFromLua(result, err)
}

func cacheApplyUserQuotaDelta(userID int, delta int64) (cacheQuotaResult, error) {
	result, err := common.RDB.Eval(context.Background(), userQuotaDeltaScript,
		[]string{getUserCacheKey(userID)}, delta, userID, userCacheSchemaVersion).Int()
	return quotaResultFromLua(result, err)
}

func cacheApplyUserGiftQuotaDelta(userID int, delta int64) (cacheQuotaResult, error) {
	result, err := common.RDB.Eval(context.Background(), userGiftQuotaDeltaScript,
		[]string{getUserCacheKey(userID)}, delta, userID, userCacheSchemaVersion).Int()
	return quotaResultFromLua(result, err)
}

func cacheTryReserveUserWalletSplit(userID int, amount int64) (giftUsed int, result cacheQuotaResult, err error) {
	raw, err := common.RDB.Eval(context.Background(), userWalletSplitReserveScript,
		[]string{getUserCacheKey(userID)}, amount, userID, userCacheSchemaVersion).Int()
	if err != nil {
		return 0, cacheQuotaMiss, err
	}
	switch {
	case raw == -1:
		return 0, cacheQuotaMiss, nil
	case raw == 0:
		return 0, cacheQuotaInsufficient, nil
	default:
		return raw - 1, cacheQuotaOK, nil
	}
}

func cacheTryReserveTokenQuota(id int, key string, amount int64) (cacheQuotaResult, error) {
	result, err := common.RDB.Eval(context.Background(), tokenQuotaReserveScript,
		[]string{getTokenCacheKey(key)}, amount, id, common.GetTimestamp()).Int()
	return quotaResultFromLua(result, err)
}

func cacheApplyTokenQuotaDelta(id int, key string, delta int64) (cacheQuotaResult, error) {
	result, err := common.RDB.Eval(context.Background(), tokenQuotaDeltaScript,
		[]string{getTokenCacheKey(key)}, delta, id, common.GetTimestamp()).Int()
	return quotaResultFromLua(result, err)
}

// persistUserQuotaDelta 把已在缓存侧预扣成功的增量落库；批量模式下入队，
// 直写模式下要求行存在（用户已删除时报错，交由调用方补偿缓存）。
func persistUserQuotaDelta(id int, delta int) error {
	if common.BatchUpdateEnabled {
		addNewRecord(BatchUpdateTypeUserQuota, id, delta)
		return nil
	}
	result := DB.Model(&User{}).Where("id = ?", id).Update("quota", gorm.Expr("quota + ?", delta))
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func persistTokenQuotaDelta(id int, delta int) error {
	if common.BatchUpdateEnabled {
		addNewRecord(BatchUpdateTypeTokenQuota, id, delta)
		return nil
	}
	result := DB.Model(&Token{}).Where("id = ?", id).Updates(
		map[string]interface{}{
			"remain_quota":  gorm.Expr("remain_quota + ?", delta),
			"used_quota":    gorm.Expr("used_quota - ?", delta),
			"accessed_time": common.GetTimestamp(),
		},
	)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func reserveUserQuotaDB(id int, quota int) (bool, error) {
	result := DB.Model(&User{}).
		Where("id = ? AND quota >= ?", id, quota).
		Update("quota", gorm.Expr("quota - ?", quota))
	return result.RowsAffected == 1, result.Error
}

func reserveTokenQuotaDB(id int, quota int) (bool, error) {
	result := DB.Model(&Token{}).
		Where("id = ? AND remain_quota >= ?", id, quota).
		Updates(map[string]interface{}{
			"remain_quota":  gorm.Expr("remain_quota - ?", quota),
			"used_quota":    gorm.Expr("used_quota + ?", quota),
			"accessed_time": common.GetTimestamp(),
		})
	return result.RowsAffected == 1, result.Error
}

// TryReserveUserQuota atomically checks and deducts a user's wallet quota.
// 缓存命中时以缓存余额为准（避免批量模式下过期的数据库余额放大并发超扣）；
// Redis 异常或水合失败时降级为数据库条件更新，保证服务可用。
func TryReserveUserQuota(id int, quota int) (bool, error) {
	if quota < 0 {
		return false, errors.New("quota 不能为负数！")
	}
	if quota == 0 {
		return true, nil
	}
	if !common.RedisEnabled {
		return reserveUserQuotaDB(id, quota)
	}

	result, err := cacheTryReserveUserQuota(id, int64(quota))
	if err == nil && result == cacheQuotaMiss {
		if _, hydrateErr := GetUserCache(id); hydrateErr == nil {
			result, err = cacheTryReserveUserQuota(id, int64(quota))
		}
	}
	if err != nil || result == cacheQuotaMiss {
		if err != nil {
			common.SysLog("user quota cache reserve unavailable, falling back to database: " + err.Error())
		}
		return reserveUserQuotaDB(id, quota)
	}
	if result == cacheQuotaInsufficient {
		return false, nil
	}
	if err = persistUserQuotaDelta(id, -quota); err != nil {
		compensated, compensateErr := cacheApplyUserQuotaDelta(id, int64(quota))
		if compensateErr != nil || compensated != cacheQuotaOK {
			common.SysError(fmt.Sprintf("failed to compensate reserved user quota: result=%d error=%v", compensated, compensateErr))
		}
		return false, err
	}
	return true, nil
}

// TryReserveUserWallet reserves amount preferring gift_quota then paid quota when preferGift.
// When preferGift is false, only paid quota is used (same as TryReserveUserQuota).
func TryReserveUserWallet(id int, amount int, preferGift bool) (giftUsed int, paidUsed int, ok bool, err error) {
	if amount < 0 {
		return 0, 0, false, errors.New("quota 不能为负数！")
	}
	if amount == 0 {
		return 0, 0, true, nil
	}
	if !preferGift {
		ok, err = TryReserveUserQuota(id, amount)
		if ok {
			return 0, amount, true, nil
		}
		return 0, 0, false, err
	}
	if !common.RedisEnabled {
		return reserveUserWalletSplitDB(id, amount)
	}

	giftUsed, result, err := cacheTryReserveUserWalletSplit(id, int64(amount))
	if err == nil && result == cacheQuotaMiss {
		if _, hydrateErr := GetUserCache(id); hydrateErr == nil {
			giftUsed, result, err = cacheTryReserveUserWalletSplit(id, int64(amount))
		}
	}
	if err != nil || result == cacheQuotaMiss {
		if err != nil {
			common.SysLog("user wallet split cache reserve unavailable, falling back to database: " + err.Error())
		}
		return reserveUserWalletSplitDB(id, amount)
	}
	if result == cacheQuotaInsufficient {
		return 0, 0, false, nil
	}
	paidUsed = amount - giftUsed
	if giftUsed > 0 {
		if err = persistUserGiftQuotaDelta(id, -giftUsed); err != nil {
			_, _ = cacheApplyUserGiftQuotaDelta(id, int64(giftUsed))
			if paidUsed > 0 {
				_, _ = cacheApplyUserQuotaDelta(id, int64(paidUsed))
			}
			return 0, 0, false, err
		}
	}
	if paidUsed > 0 {
		if err = persistUserQuotaDelta(id, -paidUsed); err != nil {
			_, _ = cacheApplyUserQuotaDelta(id, int64(paidUsed))
			if giftUsed > 0 {
				_ = persistUserGiftQuotaDelta(id, giftUsed)
				_, _ = cacheApplyUserGiftQuotaDelta(id, int64(giftUsed))
			}
			return 0, 0, false, err
		}
	}
	return giftUsed, paidUsed, true, nil
}

func persistUserGiftQuotaDelta(id int, delta int) error {
	result := DB.Model(&User{}).Where("id = ?", id).Update("gift_quota", gorm.Expr("gift_quota + ?", delta))
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func reserveUserWalletSplitDB(id int, amount int) (giftUsed int, paidUsed int, ok bool, err error) {
	err = DB.Transaction(func(tx *gorm.DB) error {
		var u User
		if e := lockForUpdate(tx).Select("id", "quota", "gift_quota").First(&u, id).Error; e != nil {
			return e
		}
		if u.GiftQuota+u.Quota < amount {
			ok = false
			return nil
		}
		giftUsed = u.GiftQuota
		if giftUsed > amount {
			giftUsed = amount
		}
		paidUsed = amount - giftUsed
		updates := map[string]interface{}{}
		if giftUsed > 0 {
			updates["gift_quota"] = gorm.Expr("gift_quota - ?", giftUsed)
		}
		if paidUsed > 0 {
			updates["quota"] = gorm.Expr("quota - ?", paidUsed)
		}
		if len(updates) == 0 {
			ok = true
			return nil
		}
		if e := tx.Model(&User{}).Where("id = ?", id).Updates(updates).Error; e != nil {
			return e
		}
		ok = true
		return nil
	})
	return giftUsed, paidUsed, ok, err
}

// TryReserveTokenQuota atomically checks and deducts a token quota. Unlimited
// tokens skip the balance check but still update remain/used accounting.
func TryReserveTokenQuota(id int, key string, quota int, unlimited bool) (bool, error) {
	if quota < 0 {
		return false, errors.New("quota 不能为负数！")
	}
	if quota == 0 {
		return true, nil
	}
	if unlimited {
		return true, DecreaseTokenQuota(id, key, quota)
	}
	if !common.RedisEnabled {
		return reserveTokenQuotaDB(id, quota)
	}

	result, err := cacheTryReserveTokenQuota(id, key, int64(quota))
	if err == nil && result == cacheQuotaMiss {
		if _, hydrateErr := GetTokenByKey(key, true); hydrateErr == nil {
			result, err = cacheTryReserveTokenQuota(id, key, int64(quota))
		}
	}
	if err != nil || result == cacheQuotaMiss {
		if err != nil {
			common.SysLog("token quota cache reserve unavailable, falling back to database: " + err.Error())
		}
		return reserveTokenQuotaDB(id, quota)
	}
	if result == cacheQuotaInsufficient {
		return false, nil
	}
	if err = persistTokenQuotaDelta(id, -quota); err != nil {
		compensated, compensateErr := cacheApplyTokenQuotaDelta(id, key, int64(quota))
		if compensateErr != nil || compensated != cacheQuotaOK {
			common.SysError(fmt.Sprintf("failed to compensate reserved token quota: result=%d error=%v", compensated, compensateErr))
		}
		return false, err
	}
	return true, nil
}
