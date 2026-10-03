package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEnsureStarterTokenCreatesOnce(t *testing.T) {
	truncateTables(t)

	EnsureStarterToken(0)
	var none int64
	require.NoError(t, DB.Model(&Token{}).Count(&none).Error)
	assert.Equal(t, int64(0), none)

	EnsureStarterToken(9)
	var first []Token
	require.NoError(t, DB.Where("user_id = ?", 9).Find(&first).Error)
	require.Len(t, first, 1)
	assert.Equal(t, "starter", first[0].Name)
	assert.True(t, first[0].UnlimitedQuota)
	assert.Equal(t, int64(-1), first[0].ExpiredTime)
	assert.Equal(t, common.TokenStatusEnabled, first[0].Status)
	assert.NotEmpty(t, first[0].Key)

	EnsureStarterToken(9)
	var second int64
	require.NoError(t, DB.Model(&Token{}).Where("user_id = ?", 9).Count(&second).Error)
	assert.Equal(t, int64(1), second)
}
