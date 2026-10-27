package dto

import (
	"testing"

	kitutil "github.com/QuantumNous/new-api/relaykit/relayconvert/kitutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAudioRequestOptionalSpeechFields(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{
			name: "absent provider options stay absent",
			body: `{"model":"fixture-tts","input":"原始台词"}`,
		},
		{
			name: "explicit empty voice stays explicit",
			body: `{"model":"fixture-tts","input":"原始台词","voice":""}`,
		},
		{
			name: "reference options preserve explicit zero false and empty strings",
			body: `{"model":"fixture-tts","input":"原始台词","voice":"alloy","prompt_audio":"data:audio/mpeg;base64,SUQzZml4dHVyZQ==","prompt_audio_url":"https://invalid.example/reference.wav","prompt_text":"","output_format":"","response_data_format":"url","emo_audio_prompt_url":"https://invalid.example/emotion.wav","emo_alpha":0,"emo_text":"","use_emo_text":false}`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var request AudioRequest
			require.NoError(t, kitutil.Unmarshal([]byte(tt.body), &request))
			encoded, err := kitutil.Marshal(request)
			require.NoError(t, err)
			assert.JSONEq(t, tt.body, string(encoded))
		})
	}
}

func TestAudioRequestDoesNotPromoteSDKExtraBody(t *testing.T) {
	// SDK extra_body options are merged into the HTTP body by the SDK. A raw
	// nested extra_body object is not a second set of speech request fields.
	var request AudioRequest
	err := kitutil.Unmarshal([]byte(`{"model":"fixture-tts","input":"原始台词","voice":"alloy","text":"do not rename this","extra_body":{"model":"shadow-model","input":"shadow-input","prompt_audio_url":"https://invalid.example/nested.wav"}}`), &request)
	require.NoError(t, err)
	encoded, err := kitutil.Marshal(request)
	require.NoError(t, err)
	assert.JSONEq(t, `{"model":"fixture-tts","input":"原始台词","voice":"alloy"}`, string(encoded))
}
