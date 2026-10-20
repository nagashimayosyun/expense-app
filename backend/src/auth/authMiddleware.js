// backend/src/auth/authMiddleware.js
const jwt = require('jsonwebtoken');
const pool = require('../dbConfig'); // DB接続プール

// JWTを検証し、リクエストにユーザー情報を追加するミドルウェア
const protect = async (req, res, next) => {
    let token;

    // JWT_SECRET が環境変数から読み込めているか確認
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
        console.error("FATAL ERROR: JWT_SECRET is not defined in .env");
        // サーバー起動時にチェックすべきですが、念のためミドルウェアでもチェック
        return res.status(500).json({ message: 'Server configuration error.' });
    }

    // ⭐ 修正: cookie-parser を使用し、req.cookies から直接 'jwt' トークンを取得 ⭐
    if (req.cookies && req.cookies.jwt) {
        token = req.cookies.jwt;
    }

    if (!token) {
        // トークンがない（未ログイン）
        return res.status(401).json({ message: 'Not authorized, no token' });
    }

    // ⭐ 修正: 全体の try...catch で DBアクセスを含むエラーを処理 ⭐
    try {
        // 1. JWTトークンの検証
        const decoded = jwt.verify(token, JWT_SECRET);

        // デバッグログ
        console.log(`[AUTH DEBUG] Token decoded. User ID: ${decoded.id}. Attempting DB query...`);

        // 2. DBからユーザー情報を取得 (IDが存在するか確認)
        // トークンにIDが含まれていても、ユーザーがDBから削除されている可能性があるためチェック
        const userResult = await pool.query('SELECT id, email FROM users WHERE id = $1', [decoded.id]);
        const user = userResult.rows[0];

        if (user) {
            req.user = user; // 後続のルートで使用できるようにユーザー情報をreqオブジェクトに追加
            next(); // 認証成功、次の処理へ
        } else {
            // トークンは有効だが、DBにユーザー情報が見つからない
            console.warn(`[AUTH WARNING] Valid token found, but user ID ${decoded.id} not in DB.`);
            res.status(401).json({ message: 'Not authorized, user not found in database' });
        }
    } catch (error) {
        // トークンが無効（期限切れ、不正、またはDBエラーなど）
        console.error("[AUTH ERROR] Token verification or DB query failed:", error.message || error);
        
        // クライアントには一般的なエラーを返す
        res.status(401).json({ message: 'Not authorized, token validation failed' });
    }
};

module.exports = { protect };