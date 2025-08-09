# Hybrid Wallet

Technical documentation for OAuth-authenticated Sui blockchain wallet with deterministic key generation.

## Overview

This application combines OAuth authentication (GitHub/Google) with Sui blockchain functionality. Users authenticate via OAuth providers and receive a deterministic wallet that remains consistent across sessions.

## Architecture

- **Frontend**: Next.js with React components
- **Authentication**: OAuth 2.0 (GitHub, Google)
- **Blockchain**: Sui network integration
- **Key Generation**: Deterministic Ed25519 keypairs
- **Storage**: Browser localStorage for session management

## Getting Started

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env.local

# Start development server
npm run dev
```

## Environment Variables

```env
NEXT_PUBLIC_GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
NEXT_PUBLIC_SUI_RPC_URL=https://fullnode.devnet.sui.io
NEXTAUTH_SECRET=your_secret_key
NEXTAUTH_URL=http://localhost:3000
```

## API Endpoints

### `/api/auth/callback`
Handles OAuth callbacks, processes user tokens.

### `/api/faucet`
Requests test SUI tokens for development.


```

## OAuth Configuration

### GitHub
1. Create OAuth App at GitHub Settings → Developer settings
2. Set Authorization callback URL: `http://localhost:3000/api/auth/callback`
3. Copy Client ID and Secret to environment variables

### Google
1. Create project in Google Cloud Console
2. Enable Google+ API
3. Create OAuth 2.0 credentials
4. Set authorized redirect URI: `http://localhost:3000/api/auth/callback`

## Security Features

- Deterministic key generation from OAuth identity
- Local session storage with 24-hour expiry
- Private key encryption in browser storage
- Network-specific RPC endpoints

## Sui Integration

### Supported Networks
- **Devnet**: Development and testing
- **Testnet**: Pre-production testing
- **Mainnet**: Production deployment

### Transaction Flow
1. Create transaction object
2. Sign with generated keypair
3. Submit to Sui network
4. Return transaction hash and effects

## Development

### Running Tests
```bash
npm test
```

### Building for Production
```bash
npm run build
```

### Deployment
Deploy to Vercel:
1. Connect GitHub repository
2. Configure environment variables
3. Deploy automatically on push

## Error Handling

Common error scenarios:
- OAuth provider configuration issues
- Network connectivity problems
- Insufficient balance for transactions
- Invalid recipient addresses

## Security Considerations

- Never expose private keys in client-side code
- Use HTTPS in production
- Implement proper session management
- Validate all user inputs
- Use environment variables for secrets

## Dependencies

- `@mysten/sui` - Sui blockchain SDK
- `next` - React framework
- `react` - UI library
- `tailwindcss` - Styling
- `lucide-react` - Icons

## License

MIT