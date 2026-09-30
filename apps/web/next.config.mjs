/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@field/ui', '@field/types', '@field/config', '@field/form-engine', '@field/form-renderer'],
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8055',
      },
    ],
  },
};

export default nextConfig;
