/** @type {import('next').NextConfig} */
const isProduction = process.env.NODE_ENV === 'production';

const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  trailingSlash: true,
  basePath: isProduction ? '/talent-graph' : '',
  assetPrefix: isProduction ? '/talent-graph/' : '',
  images: { unoptimized: true },
};

module.exports = nextConfig;
