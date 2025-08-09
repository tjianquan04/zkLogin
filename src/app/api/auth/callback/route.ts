// src/app/api/auth/callback/route.ts - FIXED VERSION
import { NextRequest, NextResponse } from 'next/server';

interface GitHubUser {
  id: number;
  login: string;
  email: string;
  name: string;
  avatar_url: string;
}

interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const idToken = url.searchParams.get('id_token');

  // Determine provider from state parameter
  const provider = getProviderFromState(state);
  
  console.log(`${provider || 'Unknown'} OAuth callback:`, { 
    code: !!code, 
    state, 
    error,
    idToken: !!idToken 
  });

  if (error) {
    return NextResponse.redirect(
      new URL(`/auth/process?error=${error}&provider=${provider}`, url.origin)
    );
  }

  // Handle direct ID token (Google implicit flow)
  if (idToken && !code) {
    return handleIdToken(idToken, provider || 'google', url.origin);
  }

  // Handle authorization code flow
  if (code && provider) {
    try {
      if (provider === 'github') {
        return await handleGitHubCode(code, url.origin);
      } else if (provider === 'google') {
        return await handleGoogleCode(code, url.origin);
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }
    } catch (error) {
      console.error(`${provider} OAuth error:`, error);
      return NextResponse.redirect(
        new URL(`/auth/process?error=token_exchange_failed&provider=${provider}`, url.origin)
      );
    }
  }

  return NextResponse.redirect(
    new URL(`/auth/process?error=no_code&provider=${provider}`, url.origin)
  );
}

function getProviderFromState(state: string | null): 'github' | 'google' | null {
  if (!state) return null;
  
  if (state.includes('github')) return 'github';
  if (state.includes('google')) return 'google';
  
  return null;
}

async function handleGitHubCode(code: string, origin: string): Promise<NextResponse> {
  console.log('🔍 Starting GitHub token exchange...');
  
  // Exchange code for access token
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code: code,
    }),
  });

  const tokenData = await tokenResponse.json();
  
  if (!tokenData.access_token) {
    console.error('❌ No access token from GitHub:', tokenData);
    throw new Error('No access token received from GitHub');
  }

  // Get user info
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
      'User-Agent': 'zkLogin-Wallet',
    },
  });
  
  const userData: GitHubUser = await userResponse.json();
  console.log('✅ GitHub user data:', userData);

  // Get user email if not public
  if (!userData.email) {
    const emailResponse = await fetch('https://api.github.com/user/emails', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'User-Agent': 'zkLogin-Wallet',
      },
    });
    const emails = await emailResponse.json();
    const primaryEmail = emails.find((email: any) => email.primary);
    userData.email = primaryEmail?.email || '';
  }
  
  // Create normalized user token for zkLogin compatibility
  const userToken = btoa(JSON.stringify({
    sub: userData.id.toString(),
    email: userData.email || `${userData.login}@github.local`,
    login: userData.login,
    name: userData.name,
    avatar_url: userData.avatar_url,
    provider: 'github',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  }));

  console.log('✅ GitHub token exchange successful');
  return NextResponse.redirect(
    new URL(`/auth/process?token=${userToken}&provider=github`, origin)
  );
}

async function handleGoogleCode(code: string, origin: string): Promise<NextResponse> {
  try {
    console.log('🔍 Starting Google token exchange...');
    console.log('Code received:', code ? 'Yes' : 'No');
    console.log('Origin:', origin);
    
    const tokenPayload = {
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: `${origin}/api/auth/callback`,
    };
    
    console.log('🔍 Token exchange payload:');
    console.log('- client_id:', tokenPayload.client_id ? 'Set' : 'Missing');
    console.log('- client_secret:', tokenPayload.client_secret ? 'Set' : 'Missing');
    console.log('- redirect_uri:', tokenPayload.redirect_uri);
    
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(tokenPayload),
    });

    console.log('🔍 Token response status:', tokenResponse.status);
    console.log('🔍 Token response headers:', Object.fromEntries(tokenResponse.headers.entries()));
    
    const tokenData: GoogleTokenResponse = await tokenResponse.json();
    console.log('🔍 Token response data:', tokenData);
    
    if (!tokenResponse.ok) {
      console.error('❌ Token exchange failed:', tokenData);
      throw new Error(`Token exchange failed: ${tokenData.error_description || tokenData.error}`);
    }
    
    if (!tokenData.id_token) {
      console.error('❌ No ID token in response:', tokenData);
      throw new Error('No ID token received from Google');
    }

    console.log('✅ Google token exchange successful');
    return handleIdToken(tokenData.id_token, 'google', origin);

  } catch (error) {
    console.error('❌ Google OAuth error:', error);
    throw error; // Re-throw to be caught by parent
  }
}

function handleIdToken(idToken: string, provider: string, origin: string): NextResponse {
  try {
    console.log(`🔍 Processing ${provider} ID token...`);
    
    // Decode JWT payload (base64 decode the middle part)
    const payload = idToken.split('.')[1];
    const decoded = JSON.parse(atob(payload));
    
    console.log(`${provider} ID Token payload:`, decoded);

    // Create normalized user token
    let userToken: string;
    
    if (provider === 'google') {
      userToken = btoa(JSON.stringify({
        sub: decoded.sub,
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
        email_verified: decoded.email_verified,
        provider: 'google',
        iat: decoded.iat || Math.floor(Date.now() / 1000),
        exp: decoded.exp || Math.floor(Date.now() / 1000) + 3600,
      }));
    } else {
      // Generic handling for other providers
      userToken = btoa(JSON.stringify({
        sub: decoded.sub,
        email: decoded.email,
        name: decoded.name,
        provider: provider,
        iat: decoded.iat || Math.floor(Date.now() / 1000),
        exp: decoded.exp || Math.floor(Date.now() / 1000) + 3600,
      }));
    }

    console.log(`✅ ${provider} ID token processed successfully`);
    return NextResponse.redirect(
      new URL(`/auth/process?token=${userToken}&provider=${provider}`, origin)
    );
    
  } catch (error) {
    console.error('ID token processing error:', error);
    throw new Error('Failed to process ID token');
  }
}