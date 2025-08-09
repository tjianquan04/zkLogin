import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('🚰 Server: Faucet API called');
    
    const { address } = await request.json();

    if (!address || !address.match(/^0x[a-fA-F0-9]{64}$/)) {
      console.error('❌ Server: Invalid address format:', address);
      return NextResponse.json(
        { success: false, error: 'Invalid address format' }, 
        { status: 400 }
      );
    }

    console.log('🔍 Server: Processing faucet request for:', address);

    // Determine network from environment
    const rpcUrl = process.env.NEXT_PUBLIC_SUI_RPC_URL || 'https://fullnode.devnet.sui.io:443';
    const isDevnet = rpcUrl.includes('devnet');
    const isTestnet = rpcUrl.includes('testnet');
    
    console.log('🌐 Server: Detected network:', isDevnet ? 'devnet' : isTestnet ? 'testnet' : 'unknown');

    // Method 1: Try Sui SDK first
    try {
      console.log('🔄 Server: Attempting SDK faucet...');
      
      const { requestSuiFromFaucetV2, getFaucetHost } = await import('@mysten/sui/faucet');
      
      // Use correct network for SDK
      const network = isDevnet ? 'devnet' : 'testnet';
      
      const result = await requestSuiFromFaucetV2({
        host: getFaucetHost(network),
        recipient: address,
      });

      console.log('✅ Server: SDK faucet success:', result);
      
      return NextResponse.json({ 
        success: true, 
        result: result,
        method: 'sdk',
        network: network
      });

    } catch (sdkError) {
      console.warn('⚠️ Server: SDK failed, trying direct API...', sdkError);
      
      // Method 2: Fallback to direct API call
      const faucetUrl = isDevnet 
        ? 'https://faucet.devnet.sui.io/v2/gas'
        : 'https://faucet.testnet.sui.io/v2/gas';
      
      console.log('🔄 Server: Trying direct API:', faucetUrl);
      
      const faucetResponse = await fetch(faucetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          FixedAmountRequest: { recipient: address },
        }),
      });

      if (!faucetResponse.ok) {
        const errorText = await faucetResponse.text();
        console.error('❌ Server: Direct API failed:', faucetResponse.status, errorText);
        
        if (faucetResponse.status === 429) {
          return NextResponse.json(
            { success: false, error: 'Rate limit exceeded. Please wait before requesting again.' },
            { status: 429 }
          );
        }
        
        throw new Error(`Faucet API error: ${faucetResponse.status} - ${errorText}`);
      }

      const result = await faucetResponse.json();
      console.log('✅ Server: Direct API success:', result);
      
      return NextResponse.json({ 
        success: true, 
        result: result,
        method: 'direct',
        network: isDevnet ? 'devnet' : 'testnet'
      });
    }

  } catch (error) {
    console.error('❌ Server: Faucet request failed:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: (error as Error).message 
      }, 
      { status: 500 }
    );
  }
}

export async function GET() {
  const rpcUrl = process.env.NEXT_PUBLIC_SUI_RPC_URL || 'https://fullnode.devnet.sui.io:443';
  const network = rpcUrl.includes('devnet') ? 'devnet' : rpcUrl.includes('testnet') ? 'testnet' : 'mainnet';
  
  return NextResponse.json({ 
    status: 'Faucet API is running',
    network: network,
    rpcUrl: rpcUrl,
    endpoints: {
      post: '/api/faucet - Request SUI tokens'
    }
  });
}