package model

import (
	"testing"

	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/assert"
)

func TestGiftEligibleModel(t *testing.T) {
	assert.True(t, GiftEligibleModel("deepseek-v4.1-flash-1017:free"))
	assert.True(t, GiftEligibleModel("glm-5.3:free"))
	assert.False(t, GiftEligibleModel("deepseek-v4.1-flash-1017"))
	assert.False(t, GiftEligibleModel(""))
}

func TestFreeModelTwin(t *testing.T) {
	assert.Equal(t, "deepseek-v4.1-flash-1017", FreeModelTwin("deepseek-v4.1-flash-1017:free"))
	assert.Equal(t, "glm-5.3", FreeModelTwin("glm-5.3:free"))
	assert.Equal(t, "", FreeModelTwin("deepseek-v4.1-flash-1017"))
}

func TestBillingModelName(t *testing.T) {
	// 1. Without explicit ratio in ratio_setting, falls back to twin without :free
	assert.Equal(t, "fallback-model", BillingModelName("fallback-model:free"))

	// 2. With explicit ratio set on the :free model, uses the full name directly
	_ = ratio_setting.UpdateModelRatioByJSONString(`{"test-gift-model:free": 1.125, "test-gift-model": 0.3375}`)
	assert.Equal(t, "test-gift-model:free", BillingModelName("test-gift-model:free"))
	assert.Equal(t, "test-gift-model", BillingModelName("test-gift-model"))

	// 3. If ModelPrice is set to 0 (free display override), falls back to twin
	_ = ratio_setting.UpdateModelPriceByJSONString(`{"test-gift-model:free": 0}`)
	assert.Equal(t, "test-gift-model", BillingModelName("test-gift-model:free"))
}
