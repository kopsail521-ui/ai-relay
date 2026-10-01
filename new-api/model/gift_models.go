package model

import (
	"strings"
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
	if twin := FreeModelTwin(modelName); twin != "" {
		return twin
	}
	return modelName
}
