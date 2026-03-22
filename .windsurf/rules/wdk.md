# WDK (Wallet Development Kit) Project Rules

## Overview
WDK is Tether's Wallet Development Kit for building multichain cryptocurrency wallets with TypeScript/JavaScript.

## Key Conventions
- Use TypeScript for type safety
- Follow WDK module patterns for wallet operations
- Implement proper error handling for blockchain operations
- Use async/await for all blockchain interactions
- Follow WDK naming conventions for functions and variables

## Package Structure
- Install WDK packages via npm: `@tether/wdk-*`
- Main packages include core, utilities, and chain-specific modules
- Each chain has its own module (e.g., ethereum, bitcoin, solana)

## Common Patterns
- Always validate addresses before transactions
- Use proper gas estimation for EVM chains
- Implement transaction confirmation checks
- Handle network errors gracefully
- Use WDK's built-in retry mechanisms

## Security Best Practices
- Never expose private keys in client-side code
- Use WDK's secure key management
- Validate all user inputs
- Implement rate limiting for API calls
- Use HTTPS for all communications

## Testing
- Write unit tests for all wallet operations
- Use testnets for blockchain integration tests
- Mock blockchain responses for unit tests
- Test error scenarios thoroughly

## Development Workflow
1. Set up WDK environment
2. Configure blockchain connections
3. Implement wallet functionality
4. Add proper error handling
5. Write comprehensive tests
6. Deploy with security best practices
