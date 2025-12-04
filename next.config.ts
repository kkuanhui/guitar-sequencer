/** @type {import('next').NextConfig} */
const nextConfig = {
  // 1. 啟用靜態導出 (必須)
  output: 'export',
  
  // 2. 設定專案路徑前綴 (BasePath)，將 <YOUR-REPO-NAME> 替換成您的實際 GitHub 儲存庫名稱
  // 範例：如果您的網址是 https://username.github.io/my-guitar-app/
  // 則 basePath 應該是 '/my-guitar-app'
  basePath: '/guitar-sequencer', 

  // 3. 停用 Next.js 圖片優化，因為它不支援靜態導出
  images: {
    unoptimized: true,
  }
};

module.exports = nextConfig;
