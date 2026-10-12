package relay

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/model_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type imageBillingSpy struct {
	settleCalls int
}

func (b *imageBillingSpy) Settle(int) error {
	b.settleCalls++
	return nil
}
func (b *imageBillingSpy) Refund(*gin.Context)      {}
func (b *imageBillingSpy) NeedsRefund() bool        { return b.settleCalls == 0 }
func (b *imageBillingSpy) GetPreConsumedQuota() int { return 100 }
func (b *imageBillingSpy) Reserve(int) error        { return nil }

// Exercise the real request/adaptor/ImageHelper boundary: a failed upstream
// image response must not be turned into synthetic usage and settled. The
// controller owns refunding this error; the billing session must remain open.
func TestImageHelperDoesNotSettleFailedImageResponse(t *testing.T) {
	oldMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(oldMode) })
	settings := model_setting.GetGlobalSettings()
	oldPassThrough := settings.PassThroughRequestEnabled
	settings.PassThroughRequestEnabled = false
	t.Cleanup(func() { settings.PassThroughRequestEnabled = oldPassThrough })
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	tests := []struct {
		name        string
		body        string
		contentType string
		stream      bool
	}{
		{"empty JSON", `{"data":[]}`, "application/json", false},
		{"empty JSON stream fallback", `{"data":[]}`, "application/json", true},
		{"unusable result with usage", `{"data":[{}],"usage":{"input_tokens":3,"output_tokens":4,"total_tokens":7}}`, "application/json", false},
		{"business error without type", `{"error":{"message":"generation failed"}}`, "application/json", false},
		{"SSE error", "data: {\"type\":\"error\",\"message\":\"generation failed\"}\n\ndata: [DONE]\n\n", "text/event-stream", true},
		{"SSE cancelled", "data: {\"type\":\"image_generation.cancelled\"}\n\ndata: [DONE]\n\n", "text/event-stream", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			upstreamCalls := 0
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				upstreamCalls++
				assert.Equal(t, "/v1/images/generations", r.URL.Path)
				_, err := io.Copy(io.Discard, r.Body)
				require.NoError(t, err)
				w.Header().Set("Content-Type", tt.contentType)
				_, err = io.WriteString(w, tt.body)
				require.NoError(t, err)
			}))
			t.Cleanup(upstream.Close)

			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(`{"model":"image-test","prompt":"draw a cat"}`))
			c.Request.Header.Set("Content-Type", "application/json")
			common.SetContextKey(c, constant.ContextKeyChannelType, constant.ChannelTypeOpenAI)
			common.SetContextKey(c, constant.ContextKeyChannelBaseUrl, upstream.URL)
			common.SetContextKey(c, constant.ContextKeyOriginalModel, "image-test")
			billing := &imageBillingSpy{}
			info := &relaycommon.RelayInfo{
				Request:         &dto.ImageRequest{Model: "image-test", Prompt: "draw a cat"},
				OriginModelName: "image-test",
				RelayFormat:     types.RelayFormatOpenAI,
				RelayMode:       relayconstant.RelayModeImagesGenerations,
				RequestURLPath:  "/v1/images/generations",
				IsStream:        tt.stream,
				DisablePing:     true,
				Billing:         billing,
			}
			info.PriceData.UsePrice = true
			info.PriceData.ModelPrice = 0.027397
			info.PriceData.AddOtherRatio("n", 3)

			err := ImageHelper(c, info)

			require.NotNil(t, err)
			assert.Equal(t, http.StatusBadGateway, err.StatusCode)
			assert.Equal(t, 1, upstreamCalls)
			assert.Zero(t, billing.settleCalls, "failed images must never commit their precharge")
			assert.True(t, billing.NeedsRefund(), "controller's error defer must still be able to refund")
		})
	}
}
