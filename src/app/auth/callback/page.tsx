// src/app/auth/callback/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import jwt from 'jsonwebtoken';

interface GoogleUser {
  sub: string;
  email: string;
  name: string;
  picture: string;
  email_verified: boolean;
  iss: string;
  aud: string;
}

interface GitHubUser {
  sub: string;
  email: string;
  login: string;
  name: string;
  avatar_url: string;
  provider: string;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const idToken = searchParams.get('id_token');
        const error = searchParams.get('error');
        const state = searchParams.get('state');

        console.log('Auth callback received:', { 
          idToken: !!idToken, 
          error, 
          state 
        });

        // Handle OAuth errors
        if (error) {
          console.error('OAuth Error:', error);
          router.replace(`/?auth=error&message=${encodeURIComponent(String(error))}`);
          return;
        }

        // Handle missing ID token
        if (!idToken) {
          console.error('No id_token returned');
          router.replace('/?auth=error&message=No authentication token received');
          return;
        }

        // Decode the token to see who logged in
        const decoded = jwt.decode(idToken) as GoogleUser;
        console.log('ID Token payload:', decoded);

        if (!decoded) {
          throw new Error('Failed to decode authentication token');
        }

        // Determine provider from issuer or state
        let provider: 'google' | 'github' = 'google'; // Default assumption
        
        if (decoded.iss?.includes('accounts.google.com')) {
          provider = 'google';
        } else if (decoded.iss?.includes('github.com')) {
          provider = 'github';
        } else if (state?.includes('github')) {
          provider = 'github';
        } else if (state?.includes('google')) {
          provider = 'google';
        }

        console.log('Detected provider:', provider);

        // Create normalized user data for zkLogin
        let normalizedUser: any;

        if (provider === 'google') {
          normalizedUser = {
            sub: decoded.sub,
            email: decoded.email,
            name: decoded.name,
            picture: decoded.picture,
            email_verified: decoded.email_verified,
            provider: 'google',
            exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
            iat: Math.floor(Date.now() / 1000),
            // Keep original token data for reference
            original_iss: decoded.iss,
            original_aud: decoded.aud,
          };
        } else {
          // Handle GitHub or other providers
          const githubUser = decoded as any;
          normalizedUser = {
            sub: githubUser.sub || githubUser.id?.toString(),
            email: githubUser.email,
            login: githubUser.login,
            name: githubUser.name,
            avatar_url: githubUser.avatar_url,
            provider: 'github',
            exp: Math.floor(Date.now() / 1000) + 3600,
            iat: Math.floor(Date.now() / 1000),
          };
        }

        console.log('Normalized user data:', normalizedUser);

        // Store user data in session storage with provider-specific key
        const userToken = Buffer.from(JSON.stringify(normalizedUser)).toString('base64');
        
        if (provider === 'google') {
          sessionStorage.setItem('google_token', userToken);
        } else if (provider === 'github') {
          sessionStorage.setItem('github_token', userToken);
        }

        // Redirect to success page
        router.replace('/?auth=success');

      } catch (error) {
        console.error('Callback processing error:', error);
        router.replace(`/?auth=error&message=${encodeURIComponent('Authentication processing failed')}`);
      }
    };

    handleCallback();
  }, [searchParams, router]);

  // Determine display info
  const state = searchParams.get('state');
  const provider = state?.includes('github') ? 'GitHub' : 'Google';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 flex items-center justify-center p-4">
      <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 max-w-md w-full text-center">
        {/* Loading Animation */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-full p-4 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
          <div className="w-8 h-8 animate-spin border-4 border-white border-t-transparent rounded-full"></div>
        </div>
        
        {/* Content */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Processing {provider} Authentication
        </h1>
        <p className="text-gray-600 mb-6">
          Please wait while we verify your credentials and set up your zkLogin wallet...
        </p>
        
        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden mb-4">
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 h-full rounded-full animate-pulse w-3/4"></div>
        </div>
        
        {/* Steps */}
        <div className="text-left space-y-2 text-sm text-gray-600">
          <div className="flex items-center">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
            <span>✓ {provider} authentication received</span>
          </div>
          <div className="flex items-center">
            <div className="w-2 h-2 bg-blue-500 rounded-full mr-3 animate-pulse"></div>
            <span>Verifying identity token...</span>
          </div>
          <div className="flex items-center">
            <div className="w-2 h-2 bg-gray-300 rounded-full mr-3"></div>
            <span>Setting up zkLogin wallet</span>
          </div>
        </div>
        
        <p className="text-xs text-gray-500 mt-6">
          Your authentication is being processed securely. This should only take a moment.
        </p>
      </div>
    </div>
  );
}