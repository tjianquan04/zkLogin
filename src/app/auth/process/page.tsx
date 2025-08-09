// src/app/auth/process/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AuthProcessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const processAuth = () => {
      const token = searchParams.get('token');
      const error = searchParams.get('error');
      const provider = searchParams.get('provider') || 'unknown';

      console.log('Processing auth:', { token: !!token, error, provider });

      if (error) {
        console.error(`${provider} OAuth error:`, error);
        
        // Map error codes to user-friendly messages
        const errorMessages: { [key: string]: string } = {
          'access_denied': 'You denied access to the application',
          'token_exchange_failed': 'Failed to exchange authorization code',
          'no_code': 'No authorization code received',
          'unsupported_provider': 'Authentication provider not supported',
        };

        const message = errorMessages[error] || `Authentication failed: ${error}`;
        
        // Redirect to main page with error
        router.replace(`/?auth=error&message=${encodeURIComponent(message)}`);
        return;
      }

      if (token) {
        try {
          // Decode and validate the token
          const userData = JSON.parse(atob(token));
          console.log(`${provider} user data:`, userData);

          // Store the token in session storage with provider-specific key
          if (provider === 'github') {
            sessionStorage.setItem('github_token', token);
          } else if (provider === 'google') {
            sessionStorage.setItem('google_token', token);
          } else {
            // Fallback for unknown providers
            sessionStorage.setItem(`${provider}_token`, token);
          }

          // Redirect to success
          router.replace('/?auth=success');
          
        } catch (error) {
          console.error('Token processing error:', error);
          router.replace('/?auth=error&message=Invalid authentication token');
        }
      } else {
        console.error('No token or error received');
        router.replace('/?auth=error&message=Authentication incomplete');
      }
    };

    processAuth();
  }, [searchParams, router]);

  // Get provider for display
  const provider = searchParams.get('provider') || 'OAuth';
  const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 flex items-center justify-center p-4">
      <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 max-w-md w-full text-center">
        {/* Loading Animation */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-full p-4 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
          <div className="w-8 h-8 animate-spin border-4 border-white border-t-transparent rounded-full"></div>
        </div>
        
        {/* Content */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Processing {providerName} Authentication
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
            <span>✓ {providerName} authentication complete</span>
          </div>
          <div className="flex items-center">
            <div className="w-2 h-2 bg-blue-500 rounded-full mr-3 animate-pulse"></div>
            <span>Setting up zkLogin wallet...</span>
          </div>
          <div className="flex items-center">
            <div className="w-2 h-2 bg-gray-300 rounded-full mr-3"></div>
            <span>Finalizing setup</span>
          </div>
        </div>
        
        <p className="text-xs text-gray-500 mt-6">
          This process is secure and private. No personal data is stored on our servers.
        </p>
      </div>
    </div>
  );
}