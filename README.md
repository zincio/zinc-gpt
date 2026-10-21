# Zinc GPT

A conversational shopping assistant that helps users find and buy products across major US retailers, built on the [Zinc MCP server](https://www.zinc.com/docs/v2/mcp/overview).

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/zincio/zinc-gpt)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fzincio%2Fzinc-gpt&env=ANTHROPIC_API_KEY&envDescription=API%20key%20required%20for%20the%20shopping%20assistant&project-name=zinc-gpt&repository-name=zinc-gpt)

## Features

- **AI-Powered Search**: Natural language product search across every retailer Zinc supports
- **Real-Time Product Data**: Live pricing and images via the [Zinc MCP server](https://www.zinc.com/docs/v2/mcp/overview)
- **Checkout by Card**: Shoppers pay on Zinc's payment page, which also collects shipping address and phone
- **Human-Confirmed Orders**: The model can only prepare an order; only the Pay & place click places it
- **Content Moderation**: Built-in filtering for prohibited items

## Architecture

Built with Next.js, the [Vercel AI SDK](https://ai-sdk.dev) (v7), and Claude Opus 5 via `@ai-sdk/anthropic`. Search and checkout go through the hosted [Zinc MCP server](https://www.zinc.com/docs/v2/mcp/overview) (`https://mcp.zinc.com/mcp`), used headlessly: the app is the MCP host and renders its own cards from each tool's `structuredContent`. No Zinc API key, wallet, or payment processor is needed.

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────────────────┐
│   Next.js App   │────▶│   Anthropic     │────▶│  Zinc MCP                │
│   (Frontend)    │     │  Claude Opus 5  │     │  search-products         │
└────────┬────────┘     └─────────────────┘     │  prepare-order           │
         │                                      └──────────────────────────┘
         │ Pay & place click
         ▼
┌─────────────────┐     ┌──────────────────────────┐     ┌─────────────────┐
│   /api/order    │────▶│  Zinc MCP place-order    │────▶│  Zinc payment   │
│                 │     │  get-payment-status      │     │  page (card)    │
└─────────────────┘     └──────────────────────────┘     └─────────────────┘
```

`prepare-order` returns a confirmation token in `_meta`. It goes to the browser for the Pay & place button and is stripped from what the model sees (`toModelOutput`), so the model can never place an order on its own.

## Limitations

- **US Only**: Shipping is restricted to United States addresses
- **Supported Retailers**: Every retailer Zinc supports (Amazon, Walmart, Target, Best Buy, Home Depot, Lowe's, Wayfair, and more)
- **Content Restrictions**: Weapons, alcohol, tobacco, drugs, and adult content are prohibited

## Getting Started

### Prerequisites

- Node.js 20+
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

# Optional: override the Zinc MCP endpoint
ZINC_MCP_URL=https://mcp.zinc.com/mcp

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

## Launch Links

Link to the app with a query to open a fresh chat that searches for it right away, e.g. from zinc.com:

```
https://<your-app>/?q=wireless%20earbuds%20under%20%2430
```

The query is URL-encoded, capped at 500 characters, and removed from the address bar once sent, so a refresh won't resend it.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | AI chat endpoint |
| `/api/order` | POST | Place a prepared order (Pay & place click only) |
| `/api/order?payment_id=` | GET | Payment status, polled until the order exists |

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── chat/           # AI chat endpoint
│   │   └── order/          # Pay & place + payment status
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
│   │   ├── zinc-mcp.ts        # Zinc MCP client (search, prepare, place, payment status)
│   │   └── zinc-products.ts   # Retailer directory (public /retailers)
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
- Order confirmation tokens never reach the model

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details
