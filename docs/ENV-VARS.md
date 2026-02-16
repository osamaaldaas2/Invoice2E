# Environment Variables

## Format-Related

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENABLE_MULTI_FORMAT` | `boolean` | `true` | Enable all 9 output formats. When `false`, only `xrechnung-cii` and `xrechnung-ubl` are available. |

## AI / Extraction

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `MISTRAL_API_KEY` | Mistral API key |

## Database

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |

## Payments

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `PAYPAL_CLIENT_ID` | PayPal client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal client secret |

## Email

| Variable | Description |
|----------|-------------|
| `SENDGRID_API_KEY` | SendGrid API key |

See `.env.example` for the full list.
