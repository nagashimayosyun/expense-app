import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Google認証プロバイダーをインポート
import { GoogleOAuthProvider } from '@react-oauth/google';

// Google Client ID (App.tsxと共通の環境変数を使用)
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* ⭐ 修正: AppをGoogleOAuthProviderでラップする ⭐ */}
    {/* クライアントIDは必ずここで指定する必要があります */}
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>,
)