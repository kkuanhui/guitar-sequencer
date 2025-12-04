/** @type {import('next').NextConfig} */
const nextConfig = {
  // 1. 啟用靜態導出 (必須)
  output: 'export',
  basePath: '/guitar-sequencer', 
  assetPrefix: '/guitar-sequencer',

  // 3. 停用 Next.js 圖片優化，因為它不支援靜態導出
  images: {
    unoptimized: true,
  }
};

module.exports = nextConfig;
