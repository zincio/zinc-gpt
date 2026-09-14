# Zinc GPT

A conversational shopping assistant powered by AI that helps users find and purchase products across major US retailers.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/zincio/zinc-gpt)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fzincio%2Fzinc-gpt&env=ANTHROPIC_API_KEY,STRIPE_SECRET_KEY,STRIPE_WEBHOOK_SECRET,NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,ZINC_API_KEY&envDescription=API%20keys%20required%20for%20the%20shopping%20assistant&project-name=zinc-gpt&repository-name=zinc-gpt)

## Features

- **AI-Powered Search**: Natural language product search across every retailer Zinc supports
- **Real-Time Product Data**: Live pricing and images via Zinc's cross-retailer search
- **Secure Checkout**: Stripe-powered payment processing
- **Automated Fulfillment**: Zinc API integration for order placement
- **Content Moderation**: Built-in filtering for prohibited items

## Architecture

Built with Next.js, the [Vercel AI SDK](https://ai-sdk.dev) (v7), and Claude Opus 5 via `@ai-sdk/anthropic`. Product search, product details, and order placement all go through the [Zinc API v2](https://www.zinc.com/docs/v2/api-reference).

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Next.js App   │────▶│   Anthropic     │────▶│  Zinc Search /  │
│   (Frontend)    │     │  Claude Opus 5  │     │  Zinc Products  │
└────────┬────────┘     └─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Stripe      │────▶│   Webhook       │────▶│    Zinc API     │
│   (Payments)    │     │   Handler       │     │  (Fulfillment)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Limitations

- **US Only**: Shipping is restricted to United States addresses
- **Supported Retailers**: Every retailer Zinc supports (Amazon, Walmart, Target, Best Buy, Home Depot, Lowe's, Wayfair, and more)
- **Content Restrictions**: Weapons, alcohol, tobacco, drugs, and adult content are prohibited

## Getting Started

### Prerequisites

- Node.js 20+
- A [Zinc](https://app.zinc.com) account with wallet funds (product search is billed per call)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/zincio/zinc-gpt.git
cd zinc-gpt

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
```

### Environment Variables

Configure the following in your `.env` file:

```bash
# Required: AI Provider (choose one)
ANTHROPIC_API_KEY=           # Anthropic Claude API key (direct)
AI_GATEWAY_API_KEY=          # ...or route through Vercel AI Gateway instead

# Optional: model tuning
ANTHROPIC_MODEL=claude-opus-5   # default; e.g. claude-sonnet-5 for a cheaper tier
ANTHROPIC_EFFORT=low            # low | medium | high | xhigh | max

# Required: Payments
STRIPE_SECRET_KEY=           # Stripe secret key
STRIPE_WEBHOOK_SECRET=       # Stripe webhook signing secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=  # Stripe publishable key

# Required: Order Fulfillment
ZINC_API_KEY=                # Zinc API key (search + fulfillment)
ZINC_WEBHOOK_SECRET=         # Zinc webhook secret (zn_whsec_...) from the dashboard

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Running Locally

```bash
# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

### Webhook Setup

For local development, use ngrok or similar to expose webhooks:

```bash
ngrok http 3000
```

Configure webhooks in:
- **Stripe Dashboard**: Point to `https://your-ngrok-url/api/stripe/webhook`
- **Zinc Dashboard** (Settings -> Webhooks): Point to `https://your-ngrok-url/api/zinc/webhook` and copy the generated secret into `ZINC_WEBHOOK_SECRET`. Zinc signs each request with an HMAC-SHA256 `X-Webhook-Signature` header; the handler listens for `order.placed`, `order.failed`, `order.tracking_received`, `order.delivered`, and `order.cancelled`.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | AI chat endpoint |
| `/api/checkout` | POST | Create Stripe checkout session |
| `/api/stripe/webhook` | POST | Handle Stripe events |
| `/api/zinc/webhook` | POST | Handle Zinc order events |

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── chat/           # AI chat endpoint
│   │   ├── checkout/       # Stripe checkout
│   │   ├── stripe/webhook/ # Stripe webhooks
│   │   └── zinc/webhook/   # Zinc webhooks
│   └── page.tsx            # Main UI
├── components/             # React components
├── lib/
│   ├── ai/
│   │   ├── content-filter.ts  # Content moderation
│   │   ├── prompts.ts         # System prompts
│   │   ├── provider.ts        # Model selection (Anthropic / AI Gateway)
│   │   └── tools.ts           # AI tools
│   ├── db/                    # SQLite database
│   ├── middleware/
│   │   ├── rate-limit.ts      # Rate limiting
│   │   └── validation.ts      # Request validation
│   ├── services/
│   │   ├── order-processor.ts # Order fulfillment
│   │   ├── product-parser.ts  # URL parsing
│   │   ├── stripe.ts          # Payment processing
│   │   ├── zinc.ts            # Zinc orders client
│   │   └── zinc-products.ts   # Zinc cross-retailer search + retailer directory
│   └── utils/
│       └── logger.ts          # Structured logging
└── types/
```

## Testing

```bash
# Run tests in watch mode
npm test

# Run tests once
npm run test:run

# Run with coverage
npm run test:coverage
```

## Security

- All API keys should be kept secret and rotated regularly
- Rate limiting is applied to all public endpoints
- Content moderation filters prohibited items
- Input validation on all API endpoints
- Webhook signatures are verified

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details
