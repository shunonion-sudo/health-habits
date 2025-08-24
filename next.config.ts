import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  eslint: {
    // Vercel ビルド時に ESLint エラーを無視
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;