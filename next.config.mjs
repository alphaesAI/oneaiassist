/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: {
    // Allows production builds to successfully complete even if the project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Allows production builds to complete even if the project has type errors.
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [
      {
        source: '/dashboard/broadcast',
        destination: '/dashboard/campaigns',
        permanent: true,
      },
      {
        source: '/dashboard/bot-config',
        destination: '/dashboard/ai-bot',
        permanent: true,
      },
      {
        source: '/dashboard/team',
        destination: '/dashboard/settings?tab=workspace&sub=team',
        permanent: false,
      },
      {
        source: '/dashboard/billing',
        destination: '/dashboard/settings?tab=account',
        permanent: false,
      },
      {
        source: '/dashboard/api',
        destination: '/dashboard/settings?tab=developer',
        permanent: false,
      },
      {
        source: '/dashboard/onboarding',
        destination: '/dashboard',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
