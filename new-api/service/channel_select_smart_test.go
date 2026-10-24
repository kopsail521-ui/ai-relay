package service

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func smartParam(ctx *gin.Context, tokenGroup, modelName string) *RetryParam {
	retry := 0
	return &RetryParam{
		Ctx:         ctx,
		TokenGroup:  tokenGroup,
		ModelName:   modelName,
		RequestPath: "/v1/chat/completions",
		Retry:       &retry,
	}
}

func smartContext(userGroup string) *gin.Context {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	common.SetContextKey(ctx, constant.ContextKeyUserGroup, userGroup)
	common.SetContextKey(ctx, constant.ContextKeyTokenCrossGroupRetry, false)
	return ctx
}

// A token that never pinned a concrete group (default) must route by price
// across every group that serves the model, not just its own group.
func TestDefaultTokenRoutesByPriceAcrossGroups(t *testing.T) {
	db := setupChannelSelectAutoGroupsTest(t)
	const modelName = "smart-routing-model"
	// GroupRatio: default=1, vip=2 (from the shared harness) → default first.
	createChannelSelectAutoGroupsChannel(t, db, 2301, "default", modelName)
	createChannelSelectAutoGroupsChannel(t, db, 2302, "vip", modelName)
	model.InitChannelCache()

	ctx := smartContext("default")
	channel, selected, err := CacheGetRandomSatisfiedChannel(smartParam(ctx, "default", modelName))
	require.NoError(t, err)
	require.NotNil(t, channel)
	assert.Equal(t, 2301, channel.Id)
	assert.Equal(t, "default", selected)
	assert.Equal(t, "default", common.GetContextKeyString(ctx, constant.ContextKeyAutoGroup))
}

// Price priority must hold even when the cheaper group is NOT the token's own:
// with vip cheaper than default, a default token starts in vip.
func TestDefaultTokenPrefersCheapestGroupEvenWhenForeign(t *testing.T) {
	db := setupChannelSelectAutoGroupsTest(t)
	const modelName = "smart-routing-model"
	createChannelSelectAutoGroupsChannel(t, db, 2311, "default", modelName)
	createChannelSelectAutoGroupsChannel(t, db, 2312, "vip", modelName)
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":2,"vip":1}`))
	model.InitChannelCache()

	ctx := smartContext("default")
	channel, selected, err := CacheGetRandomSatisfiedChannel(smartParam(ctx, "default", modelName))
	require.NoError(t, err)
	require.NotNil(t, channel)
	assert.Equal(t, 2312, channel.Id)
	assert.Equal(t, "vip", selected)
}

// The cross-group failover equivalent of the customer report: a default token
// reaches a model that only exists in another group instead of failing.
func TestDefaultTokenReachesModelServedOnlyByAnotherGroup(t *testing.T) {
	db := setupChannelSelectAutoGroupsTest(t)
	const modelName = "smart-routing-foreign-only"
	createChannelSelectAutoGroupsChannel(t, db, 2321, "vip", modelName)
	model.InitChannelCache()

	ctx := smartContext("default")
	channel, selected, err := CacheGetRandomSatisfiedChannel(smartParam(ctx, "default", modelName))
	require.NoError(t, err)
	require.NotNil(t, channel)
	assert.Equal(t, 2321, channel.Id)
	assert.Equal(t, "vip", selected)
}

// A group the user explicitly selected stays locked: no cross-group routing.
func TestExplicitGroupTokenStaysLockedToItsGroup(t *testing.T) {
	db := setupChannelSelectAutoGroupsTest(t)
	const modelName = "smart-routing-locked"
	createChannelSelectAutoGroupsChannel(t, db, 2331, "default", modelName)
	model.InitChannelCache()

	ctx := smartContext("default")
	channel, _, err := CacheGetRandomSatisfiedChannel(smartParam(ctx, "vip", modelName))
	require.NoError(t, err)
	assert.Nil(t, channel) // vip has no channel for the model; must NOT fall back to default
	_, crossGroup := common.GetContextKey(ctx, constant.ContextKeyAutoGroup)
	assert.False(t, crossGroup, "explicit group tokens must not route into other groups")
}

// Auto tokens keep their configured/token-snapshot group set but now run it
// price-sorted: cheaper groups execute first regardless of configured order.
func TestAutoTokenGroupSetIsPriceSorted(t *testing.T) {
	db := setupChannelSelectAutoGroupsTest(t)
	const modelName = "smart-routing-auto"
	createChannelSelectAutoGroupsChannel(t, db, 2341, "vip", modelName)
	createChannelSelectAutoGroupsChannel(t, db, 2342, "default", modelName)
	require.NoError(t, setting.UpdateAutoGroupsByJsonString(`["vip","default"]`))
	model.InitChannelCache()

	ctx := smartContext("default")
	// No token snapshot: the global Auto list ["vip","default"] is price-sorted
	// (default=1 < vip=2) so default executes first despite configured order.
	channel, selected, err := CacheGetRandomSatisfiedChannel(smartParam(ctx, "auto", modelName))
	require.NoError(t, err)
	require.NotNil(t, channel)
	assert.Equal(t, 2342, channel.Id)
	assert.Equal(t, "default", selected)
}

func TestIsSmartRoutingToken(t *testing.T) {
	assert.True(t, IsSmartRoutingToken("auto"))
	assert.True(t, IsSmartRoutingToken("default"))
	assert.True(t, IsSmartRoutingToken(""))
	assert.False(t, IsSmartRoutingToken("vip"))
	assert.False(t, IsSmartRoutingToken("Claude-Code-2"))
	assert.False(t, IsSmartRoutingToken("GPT-Image-Pro"))
}
