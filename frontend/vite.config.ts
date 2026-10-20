import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // ⭐ ⭐ ⭐ 1. 環境変数の場所を親ディレクトリ (../) に指定 ⭐ ⭐ ⭐
  // これにより、プロジェクトルートにある .env ファイルを読み込めます。
  envDir: path.resolve(__dirname, '..'), 

  server: {
    // ⭐ ⭐ ⭐ 2. ホストを 127.0.0.1 に固定し、IPアドレス経由でのアクセスを強制 ⭐ ⭐ ⭐
    // これにより、ブラウザが 'http://127.0.0.1:5173' にアクセスすることを保証し、
    // GCPのオリジンチェックを確実にパスさせます。
    host: '127.0.0.1', 
    port: 5173,
  },
  define: {
    // 3. バックエンドのAPIベースURLを定義
    // VITE_API_BASE_URLという変数を、process.env.VITE_API_BASE_URLとしてコード内で使用できるようにします。
    // ここで 'http://localhost:3000' を使用しているため、フロントエンドとバックエンドの通信は
    // 'localhost' 経由で行われます。
    'process.env.VITE_API_BASE_URL': JSON.stringify('http://localhost:3000'),
  }
})