package common

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestEmailDeliveryConfigured(t *testing.T) {
	server, account, sender, token, port := SMTPServer, SMTPAccount, SMTPFrom, SMTPToken, SMTPPort
	t.Cleanup(func() { SMTPServer, SMTPAccount, SMTPFrom, SMTPToken, SMTPPort = server, account, sender, token, port })
	for _, tc := range []struct {
		name, server, account, sender, token string
		port                                 int
		want                                 bool
	}{
		{name: "missing mail configuration", port: 587},
		{name: "account missing authentication token", server: "smtp.example.com", account: "sender@example.com", port: 587},
		{name: "authenticated mailbox", server: "smtp.example.com", account: "sender@example.com", token: "test-token", port: 587, want: true},
		{name: "explicit unauthenticated relay", server: "relay.example.com", sender: "sender@example.com", port: 25, want: true},
		{name: "relay missing sender", server: "relay.example.com", port: 25},
		{name: "invalid port", server: "smtp.example.com", account: "sender@example.com", token: "test-token", port: 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			SMTPServer, SMTPAccount, SMTPFrom, SMTPToken, SMTPPort = tc.server, tc.account, tc.sender, tc.token, tc.port
			assert.Equal(t, tc.want, EmailDeliveryConfigured())
		})
	}
}
