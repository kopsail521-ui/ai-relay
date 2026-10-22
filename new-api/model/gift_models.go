package model

import (
	"strings"

	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

// Free model twin billing: public display stays $0 / free; internal debit uses twin sell ratios.
// PreferGiftWallet applies whenever the request model is gift-eligible.

// GiftEligibleModel reports whether gift credits may be spent on this model id.
func GiftEligibleModel(modelName string) bool {
	name := strings.TrimSpace(modelName)
	if name == "" {
		return false
	}
	if strings.HasSuffix(strings.ToLower(name), ":free") {
		return true
	}
	if twin := FreeModelTwin(name); twin != "" && twin != name {
		return true
	}
	return false
}

// FreeModelTwin returns the paid twin used for internal billing of a free-pool id.
// Convention: strip trailing ":free". Special cases can be added here.
func FreeModelTwin(modelName string) string {
	name := strings.TrimSpace(modelName)
	lower := strings.ToLower(name)
	if strings.HasSuffix(lower, ":free") {
		return name[:len(name)-len(":free")]
	}
	return ""
}

// BillingModelName returns the model name whose ratios/prices should be used for debit.
func BillingModelName(modelName string) string {
	name := strings.TrimSpace(modelName)
	// If this model has an explicit ModelRatio defined and is not set to ModelPrice=0 (free display override),
	// use its own name for billing instead of stripping to the twin.
	if _, findPrice := ratio_setting.GetModelPrice(name, false); !findPrice {
		if _, hasRatio, _ := ratio_setting.GetModelRatio(name); hasRatio {
			return name
		}
	}
	if twin := FreeModelTwin(name); twin != "" {
		return twin
	}
	return name
}
