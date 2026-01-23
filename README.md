# Zinc GPT

A conversational shopping assistant powered by AI that helps users find and purchase products across major US retailers.

## Features

- **AI-Powered Search**: Natural language product search across Amazon and Walmart
- **Real-Time Product Data**: Live pricing and availability via SerpAPI
- **Secure Checkout**: Stripe-powered payment processing
- **Automated Fulfillment**: Zinc API integration for order placement
- **Content Moderation**: Built-in filtering for prohibited items

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Next.js App   │────▶│   Anthropic     │────▶│    SerpAPI      │
│   (Frontend)    │     │   Claude API    │     │  (Search Data)  │
└────────┬────────┘     └─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Stripe      │────▶│   Webhook       │────▶│    Zinc API     │
│   (Payments)    │     │   Handler       │     │  (Fulfillment)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Limitations

- **$100 Maximum**: Individual purchases are limited to $100
- **US Only**: Shipping is restricted to United States addresses
- **Supported Retailers**: Amazon and Walmart only
- **Content Restrictions**: Weapons, alcohol, tobacco, drugs, and adult content are prohibited

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/zinc-gpt.git
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
ANTHROPIC_API_KEY=           # Anthropic Claude API key

# Required: Product Search
SERPAPI_API_KEY=             # SerpAPI key for product search

# Required: Payments
STRIPE_SECRET_KEY=           # Stripe secret key
STRIPE_WEBHOOK_SECRET=       # Stripe webhook signing secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=  # Stripe publishable key

# Required: Order Fulfillment
ZINC_API_KEY=                # Zinc API key
ZINC_WEBHOOK_SECRET=         # Zinc webhook signing secret

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
- **Zinc Dashboard**: Point to `https://your-ngrok-url/api/zinc/webhook`

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
│   │   └── tools.tsx          # AI tools
│   ├── db/                    # SQLite database
│   ├── middleware/
│   │   ├── rate-limit.ts      # Rate limiting
│   │   └── validation.ts      # Request validation
│   ├── services/
│   │   ├── order-processor.ts # Order fulfillment
│   │   ├── product-parser.ts  # URL parsing
│   │   ├── serpapi.ts         # Product search
│   │   ├── stripe.ts          # Payment processing
│   │   └── zinc.ts            # Zinc API client
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
