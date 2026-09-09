# KeyoAPI

OpenAI-compatible multi-model API for text, image, speech, video, OCR and more.

**Public site:** https://www.keyoapi.xyz  
**Docs:** https://www.keyoapi.xyz/brand/keyo-docs.html  
**Pricing:** https://www.keyoapi.xyz/pricing

## Local components (operators)

| Component | Role | Default |
|-----------|------|---------|
| New API | API gateway, tokens, billing | http://localhost:3000 |
| pricing-admin | Internal price workbook | http://localhost:3100 |

### Pricing admin

```bat
cd pricing-admin
npm install
npm start
```

Open http://localhost:3100. Default password: `admin123` (`ADMIN_PASSWORD`).

### New API

```bat
start-new-api.bat
```

Or Docker:

```bat
docker compose up -d
```

## Layout

```
ai-relay/
  bin/                    # Windows New API binary (after download)
  docker-compose.yml
  pricing-admin/
  static/brand/           # Public brand pages
  static/seo/             # SEO landings
  services/               # Edge proxies (Creem moderation, media helpers)
  scripts/                # Deploy / ops helpers
  data/
```

## Support

- Email: kopsail521@gmail.com
- Status: https://www.keyoapi.xyz/status
- FAQ: https://www.keyoapi.xyz/faq

> Operator notes and supplier wiring live in private ops docs / VPS scripts — do not paste supplier names into public pages, marketplace copy, or customer emails.
