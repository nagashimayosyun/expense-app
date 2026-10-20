// backend/src/dbConfig.js の修正版

// 環境変数（.envファイル）から接続情報を取得
const { Pool } = require('pg');

// 接続テストの処理を削除し、Poolの定義のみに限定します。
// ★ ハングアップ防止のため connectionTimeoutMillis を追加 ★
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: false,
    max: 20,
    idleTimeoutMillis: 30000, 
    // ★ 接続試行を5秒で強制終了させ、ハングアップを防ぐ ★
    connectionTimeoutMillis: 5000, 
});

// 接続テストやテーブル作成のコードはすべて削除されます。

// アプリケーション全体で利用できるようにPoolオブジェクトをエクスポート
module.exports = pool;

pool.on('error', (err) => {
    console.error('❌ FATAL DB Pool Error:', err);
    // process.exit(1); // サーバーを終了させないためコメントアウト
});

console.log('✅ DB Pool configuration complete.');

module.exports = pool;