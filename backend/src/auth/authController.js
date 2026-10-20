// backend/src/auth/authController.js の最終修正版

const pool = require('../dbConfig');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library'); 

const JWT_SECRET = process.env.JWT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Cookieの有効期限 (単位: 日) を設定 (なければデフォルト30日)
const COOKIE_EXPIRE_DAYS = process.env.JWT_COOKIE_EXPIRE || 30;

const authenticateGoogleUser = async (req, res) => {
    const { token } = req.body; 
    if (!token) {
        return res.status(400).json({ message: 'Google ID token is required.' });
    }

    try {
        // 1. Google IDトークンを検証
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID,
        });
        
        const payload = ticket.getPayload();
        const email = payload['email'];

        // 2. データベース内でユーザーをメールアドレスで検索
        // (以前のデバッグで確認した通り、ここではroleカラムの取得は不要)
        let userResult = await pool.query(
            'SELECT id, email FROM users WHERE email = $1',
            [email]
        );
        let user = userResult.rows[0];

        // 3. ユーザーが存在しない場合 (ホワイトリストにない場合)
        if (!user) {
            console.warn(`Unauthorized access attempt by: ${email}. User not in whitelist.`);
            return res.status(403).json({ message: 'Access denied. Your email is not registered by the administrator.' });
        }
      
        // 4. 認証成功 -> アプリケーション独自のJWTを生成 (有効期限: 1日)
        const appToken = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1d' });

        // ⭐ ⭐ 【修正部分】Cookieオプションを定義し、有効期限を正しく設定 ⭐ ⭐
        const cookieOptions = {
            httpOnly: false, 
            secure: false,// 開発環境では false
            // expiresオプションで有効期限を設定 (現在時刻 + 設定日数)
            sameSite: 'None',
            expires: new Date(Date.now() + COOKIE_EXPIRE_DAYS * 24 * 60 * 60 * 1000), 
        };

        // HTTP-only Cookieにトークンをセット
        res.cookie('jwt', appToken, cookieOptions);

        res.status(200).json({
            message: 'Authentication successful',
            user: { id: user.id, email: user.email }
        });

    } catch (error) {
        console.error('Error during Google authentication:', error.message);
        res.status(401).json({ message: 'Authentication failed. Invalid token.' });
    }
};

module.exports = {
    authenticateGoogleUser,
};