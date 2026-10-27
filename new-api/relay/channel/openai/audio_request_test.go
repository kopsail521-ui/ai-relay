package openai_test

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relay/channel/openai"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Exercise the production JSON parser, retry copy, model mapper, converter and
// HTTP sender. No model service, application startup, database or billing is used.
func TestAudioSpeechFieldsReachUpstreamHTTP(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name    string
		body    string
		mapping map[string]string
	}{
		{
			name: "GLM reference URL and output options",
			body: `{"model":"GLM-TTS","input":"你好，离线字段验证","voice":"alloy","speed":1,"response_format":"mp3","prompt_audio_url":"https://invalid.example/reference.wav","prompt_text":"参考音频原文","output_format":"wav","response_data_format":"base64"}`,
		},
		{
			name: "GLM handbook request without voice",
			body: `{"model":"GLM-TTS","input":"你好，欢迎使用 KeyoAPI。","prompt_audio_url":"https://example.com/your-reference.wav","prompt_text":"替换为参考音频实际说出的完整台词。","output_format":"wav"}`,
		},
		{
			name: "Step handbook request without voice",
			body: `{"model":"Step-Audio-TTS-3B","input":"你好，欢迎使用 KeyoAPI。","prompt_audio_url":"https://example.com/your-reference.wav","prompt_text":"替换为参考音频实际说出的完整台词。"}`,
		},
		{
			name: "Index handbook request without voice",
			body: `{"model":"IndexTTS-2","input":"你好，欢迎使用 KeyoAPI。","prompt_audio_url":"https://example.com/your-reference.wav","use_emo_text":true,"emo_text":"自然清晰地讲解。"}`,
		},
		{
			name: "explicit empty voice stays explicit after retry copy",
			body: `{"model":"Step-Audio-TTS-3B","input":"明确传入空声音字段","voice":""}`,
		},
		{
			name: "GLM inline reference audio",
			body: `{"model":"GLM-TTS","input":"保留用户文本","voice":"alloy","speed":1.1,"prompt_audio":"data:audio/mpeg;base64,SUQzZml4dHVyZQ==","prompt_text":"参考音频原文"}`,
		},
		{
			name: "Index audio emotion preserves zero and false",
			body: `{"model":"IndexTTS-2","input":"请按原文朗读","voice":"alloy","speed":1,"prompt_audio_url":"https://invalid.example/speaker.wav","prompt_text":"参考音频原文","emo_audio_prompt_url":"https://invalid.example/emotion.wav","emo_alpha":0,"use_emo_text":false,"emo_text":""}`,
		},
		{
			name: "Index text emotion",
			body: `{"model":"IndexTTS-2","input":"文本情绪测试","voice":"alloy","prompt_audio_url":"https://invalid.example/speaker.wav","emo_text":"平静而自然","use_emo_text":true}`,
		},
		{
			name: "Step reference keeps voice input and speed",
			body: `{"model":"Step-Audio-TTS-3B","input":"不要替换我的台词","voice":"云希","speed":1.2,"response_format":"mp3","prompt_audio_url":"https://invalid.example/speaker.wav","prompt_text":"参考音频原文"}`,
		},
		{
			name:    "Eleven mapping changes only model",
			body:    `{"model":"eleven-v4","input":"不要改成其他内容","voice":"21m00Tcm4TlvDq8ikWAM","speed":1,"response_format":"mp3"}`,
			mapping: map[string]string{"eleven-v4": "elevenlabs/eleven-v4"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var expected map[string]any
			require.NoError(t, common.Unmarshal([]byte(tt.body), &expected))
			originModel := expected["model"].(string)
			if mapped := tt.mapping[originModel]; mapped != "" {
				expected["model"] = mapped
			}
			sent := make(chan map[string]any, 2)
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, http.MethodPost, r.Method)
				assert.Equal(t, "/v1/audio/speech", r.URL.Path)
				assert.Equal(t, "application/json", r.Header.Get("Content-Type"))
				assert.Equal(t, "Bearer fixture-only-not-real", r.Header.Get("Authorization"))
				var got map[string]any
				assert.NoError(t, common.DecodeJson(r.Body, &got))
				sent <- got
				w.Header().Set("Content-Type", "audio/mpeg")
				_, _ = w.Write([]byte("ID3local-fixture-only"))
			}))
			defer upstream.Close()
			require.Contains(t, upstream.URL, "http://127.0.0.1:")

			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/audio/speech", bytes.NewBufferString(tt.body))
			c.Request.Header.Set("Content-Type", "application/json")
			request, err := helper.GetAndValidAudioRequest(c, relayconstant.RelayModeAudioSpeech)
			require.NoError(t, err)
			defer common.CleanupBodyStorage(c)
			copied, err := common.DeepCopy(request)
			require.NoError(t, err)
			info := &relaycommon.RelayInfo{
				RelayMode:       relayconstant.RelayModeAudioSpeech,
				OriginModelName: originModel,
				RequestURLPath:  "/v1/audio/speech",
				ChannelMeta: &relaycommon.ChannelMeta{
					ChannelType:       constant.ChannelTypeOpenAI,
					ChannelBaseUrl:    upstream.URL,
					ApiKey:            "fixture-only-not-real",
					UpstreamModelName: originModel,
				},
			}
			if tt.mapping != nil {
				mapping, err := common.Marshal(tt.mapping)
				require.NoError(t, err)
				c.Set("model_mapping", string(mapping))
			}
			require.NoError(t, helper.ModelMappedHelper(c, info, copied))
			adaptor := &openai.Adaptor{}
			adaptor.Init(info)
			converted, err := adaptor.ConvertAudioRequest(c, info, *copied)
			require.NoError(t, err)
			response, err := adaptor.DoRequest(c, info, converted)
			require.NoError(t, err)
			httpResponse, ok := response.(*http.Response)
			require.True(t, ok)
			defer httpResponse.Body.Close()
			returned, err := io.ReadAll(httpResponse.Body)
			require.NoError(t, err)
			assert.Equal(t, http.StatusOK, httpResponse.StatusCode)
			assert.Equal(t, "ID3local-fixture-only", string(returned))
			require.Len(t, sent, 1, "a speech request must make exactly one local HTTP submission")
			assert.Equal(t, expected, <-sent)
		})
	}
}
