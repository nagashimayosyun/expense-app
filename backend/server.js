// backend/server.js

// 必要なライブラリをインポート
const express = require('express');
// ⭐ 修正: express() の前に app を定義
const app = express();
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken'); 
const { OAuth2Client } = require('google-auth-library'); 
// ⭐ 追加: PostgreSQL クライアント
const { Pool } = require('pg');

// dotenvを使って環境変数を読み込む
require('dotenv').config();

// ⭐ ⭐ ⭐ 環境変数の設定 ⭐ ⭐ ⭐
const GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID;
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || process.env.VITE_JWT_SECRET;
const JWT_COOKIE_EXPIRE = process.env.JWT_COOKIE_EXPIRE || 30; // 30日
const JWT_COOKIE_EXPIRE_MS = 1000 * 60 * 60 * 24 * parseInt(JWT_COOKIE_EXPIRE, 10);
// ⭐ 修正: 個別のDB接続情報を読み込むように変更
const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;


// 環境変数が設定されているかチェック
if (!GOOGLE_CLIENT_ID || !JWT_SECRET || !DB_HOST || !DB_PORT || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    console.error("❌ ERROR: Required environment variables (GOOGLE_CLIENT_ID, JWT_SECRET, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME) are not set.");
    console.error("現在の GOOGLE_CLIENT_ID:", GOOGLE_CLIENT_ID);
    console.error("現在の JWT_SECRET:", JWT_SECRET ? "設定済み" : "未設定");
    console.error("現在の DB 設定:", DB_HOST ? `${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}` : "未設定");
    process.exit(1); 
}

// ⭐ ⭐ ⭐ PostgreSQL 接続プールを初期化 (個別設定を使用) ⭐ ⭐ ⭐
const pool = new Pool({
    host: DB_HOST,
    port: parseInt(DB_PORT, 10), // ポートは数値として扱う必要がある
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    // SSL設定は本番環境でのみ必要、ここでは省略
});
console.log(`✅ PostgreSQL Pool initialized for ${DB_NAME}.`);


// OAuth2Clientを初期化 (IDトークン検証用)
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

/**
 * データベースでユーザーの存在を検証し、ユーザー情報を取得する
 * @param {string} userId - Googleのsub (未使用だがJWTに含めるため取得)
 * @param {string} email - ユーザーのメールアドレス (members.emailと照合)
 * @returns {Promise<Object>} ユーザーオブジェクトまたは認可失敗情報
 */
const verifyUserInDB = async (userId, email) => {
    // ⭐ ⭐ ⭐ 修正点 1: 入力メールアドレスの正規化 (トリムと小文字化) ⭐ ⭐ ⭐
    const normalizedEmail = email ? email.trim().toLowerCase() : null;

    if (!normalizedEmail) {
        console.log(`❌ Authorization Failed: Email is empty or null.`);
        return { authorized: false, message: "Forbidden: Email is empty or null." };
    }
    
    console.log(`[DB] Normalized Email for Query: '${normalizedEmail}'`);
    
    let client;
    try {
        client = await pool.connect();
        
        // ⭐ ⭐ ⭐ 修正点 2: DBのemailカラムも小文字化して比較する (LOWER()) ⭐ ⭐ ⭐
        const result = await client.query(
            // LOWER(email) = $1 とすることで、DBの照合設定に関わらず安全に比較できる
            `SELECT id, email, name, is_admin, is_report_target FROM members WHERE LOWER(email) = $1`,
            [normalizedEmail]
        );

        if (result.rows.length === 0) {
            console.log(`❌ Authorization Failed (PostgreSQL): Normalized Email '${normalizedEmail}' is not registered in the members table.`);
            return { 
                authorized: false, 
                message: "Forbidden: This email address is not registered as a member." 
            };
        }

        // ユーザーが見つかった場合
        const dbUser = result.rows[0];
        console.log(`✅ User found in members table: ${dbUser.email}`);
        
        // JWTに含めるためのユーザー情報
        const user = { 
            id: dbUser.id, 
            email: dbUser.email, 
            name: dbUser.name,
            is_admin: dbUser.is_admin, 
            // ⭐ 追加: is_report_target を含める
            is_report_target: dbUser.is_report_target 
            // Googleのsub (userId) はDBの id (SERIAL) とは異なるため、ここではDBの id を優先
        }; 

        return { authorized: true, user: user, message: "Authentication successful" };
        
    } catch (error) {
        console.error("❌ PostgreSQL Query Failed in verifyUserInDB:", error.message);
        return { 
            authorized: false, 
            message: `Internal Server Error: DB access failed. (${error.message})` 
        };
    } finally {
        if (client) {
            client.release();
        }
    }
};


/**
 * 認証後のセッション管理用: JWTトークンを生成
 */
// JWTペイロードにはDBのIDとメールアドレスを含める
// ⭐ 修正: name パラメータを追加
const createAuthToken = (userIdFromDb, email, name) => {
    // 識別子として DB の ID (userIdFromDb) を使用
    return jwt.sign(
        // ⭐ 修正: name もペイロードに追加
        { id: userIdFromDb, email: email, name: name }, 
        JWT_SECRET, 
        { expiresIn: `${JWT_COOKIE_EXPIRE}d` } 
    );
};

/**
 * 認証チェック用ミドルウェア: Cookie内のJWTを検証する
 */
const authenticateToken = (req, res, next) => {
    const token = req.cookies.authToken;
    
    if (!token) {
        return res.status(401).send({ message: "Unauthorized: No token provided" });
    }

    try {
        const verified = jwt.verify(token, JWT_SECRET); 
        req.user = verified; // req.user.id には DB の members.id が入る
        next(); 
    } catch (error) {
        console.log("❌ JWT Verification Failed:", error.message);
        // Cookieクリア時もローカル向けの安全設定を使用
        res.clearCookie('authToken', {
            httpOnly: true,
            secure: false, 
            sameSite: 'Lax', 
        });
        return res.status(401).send({ message: "Unauthorized: Invalid or expired token" });
    }
};

// CORS設定 (フロントエンドのアクセス元を許可)
const allowedOrigins = [
    'http://localhost:5173', 
    'http://127.0.0.1:5173', 
    // One Tap / FedCM 対策
    'http://localhost', 
    'http://127.0.0.1', 
    'http://127.0.0.1:3000',
    'http://localhost:3000', 
];
app.use(cors({
    origin: (origin, callback) => {
        // undefined (Same Origin) も許可
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.log(`❌ CORS Blocked: Origin ${origin} not allowed`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true, // Cookieの送受信を許可
}));

// ミドルウェアの適用
app.use(express.json()); 
app.use(cookieParser()); 

// ⭐ ⭐ ⭐ API ルート ⭐ ⭐ ⭐

// 認証ステータスチェックルート 
app.get('/api/auth/status', authenticateToken, (req, res) => {
    // ⭐ 修正: name も返すように変更
    res.json({ email: req.user.email, name: req.user.name, isAuthenticated: true });
});

// ⭐ Google OAuth 認証ルート (トークン検証とCookie発行)
app.post('/api/auth/google', async (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).send({ message: "Token not provided" });
    }

    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID, 
        });
        
        const payload = ticket.getPayload(); 
        const userId = payload['sub']; // GoogleのユニークID (sub)
        const userEmail = payload['email']; // 認証に使用するメールアドレス

        // ⭐ ⭐ ⭐ 修正点 3: 受け取ったメールアドレスをデバッグログ出力 ⭐ ⭐ ⭐
        console.log(`[AUTH] Incoming Google Email (Raw): '${userEmail}'`);

        // PostgreSQLでユーザーを検証・検索
        const dbVerification = await verifyUserInDB(userId, userEmail);

        if (!dbVerification.authorized) {
            // データベースに存在しない場合 (認可失敗)
            return res.status(403).json({ 
                message: dbVerification.message 
            });
        }
        
        // DBから取得したユーザーデータを使用
        let user = dbVerification.user; 

        // DBのIDを使用して認証トークンを生成
        // ⭐ 修正: JWTペイロードに name も追加
        const authToken = createAuthToken(user.id, user.email, user.name);

        // Cookie設定
        res.cookie('authToken', authToken, {
            httpOnly: true,
            secure: false, // HTTP (localhost) のため
            sameSite: 'Lax', 
            maxAge: JWT_COOKIE_EXPIRE_MS, 
        });

        // 成功応答
        res.status(200).json({ 
            message: "Authentication successful",
            email: userEmail,
            // ⭐ 追加: name も応答に含める
            name: user.name
        });

    } catch (error) {
        console.error("❌ Google ID Token verification failed:", error.message);
        res.status(401).send({ message: "Authentication failed: Invalid token" });
    }
});

// ログアウトルート
app.post('/api/auth/logout', (req, res) => {
    // Cookieクリア時もローカル向けの設定を適用
    res.clearCookie('authToken', {
        httpOnly: true,
        secure: false, 
        sameSite: 'Lax',
    });
    res.status(200).send({ message: "Logged out successfully" });
});


// ⭐ ⭐ ⭐ 新規追加: 申告データ関連のルート (REQ-003, REQ-007) ⭐ ⭐ ⭐

// -----------------------------------------------------------------
// 1. GET ルート: 現在のユーザーのアクティブな申告を取得 (REQ-007)
// -----------------------------------------------------------------
app.get('/api/declare/expense', authenticateToken, async (req, res) => {
    const memberId = req.user.id; 

    let client;
    try {
        client = await pool.connect();
        
        // 最新の申告データを1件取得
        const result = await client.query(
            `SELECT id, declaration_type_id, member_name, created_at
             FROM expenses
             WHERE member_id = $1
             ORDER BY created_at DESC
             LIMIT 1`, 
            [memberId]
        );

        // 申告が見つからなかった場合は空のオブジェクトを返す
        if (result.rows.length === 0) {
            return res.status(200).json({ activeExpense: null });
        }
        
        // 申告が見つかった場合はそのデータを返す
        const activeExpense = result.rows[0];
        res.status(200).json({ 
            activeExpense: {
                id: activeExpense.id,
                declarationTypeId: activeExpense.declaration_type_id,
                memberName: activeExpense.member_name,
                createdAt: activeExpense.created_at,
            }
        });

    } catch (error) {
        console.error("❌ Failed to fetch active expense:", error.message);
        res.status(500).json({ message: "Internal Server Error: Failed to fetch expense data." });
    } finally {
        if (client) {
            client.release();
        }
    }
});


// -----------------------------------------------------------------
// 2. POST ルート: 申告のトグル処理 (登録/リセット) (REQ-003, REQ-007)
// -----------------------------------------------------------------
app.post('/api/declare/expense', authenticateToken, async (req, res) => {
    // 認証ミドルウェア(authenticateToken)により、req.user に DB のユーザー情報 (id, email, name, ...) が格納されている
    const { declaration_type_id } = req.body; 
    const memberId = req.user.id;
    const memberName = req.user.name || req.user.email; 

    // 必須データのチェック
    if (typeof declaration_type_id !== 'number') {
        return res.status(400).json({ message: "Declaration type ID is required." });
    }


    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN'); // トランザクション開始

        // A. 既存の最新申告を取得
        const existingExpenseResult = await client.query(
            `SELECT id, declaration_type_id
             FROM expenses
             WHERE member_id = $1
             ORDER BY created_at DESC
             LIMIT 1`, 
            [memberId]
        );
        const existingExpense = existingExpenseResult.rows[0];

        // ----------------------------------------------------
        // B. 処理ロジック: 既存の申告IDと押されたボタンのIDを比較
        // ----------------------------------------------------
        
        let newActiveExpense = null;
        let operation = '';
        
        // 1. 既存の申告があり、かつ、押されたIDと一致する場合 (リセット/削除)
        if (existingExpense && existingExpense.declaration_type_id === declaration_type_id) {
            // 既存の申告を削除 (リセット)
            await client.query(
                `DELETE FROM expenses WHERE id = $1`,
                [existingExpense.id]
            );
            operation = 'RESET';
            console.log(`✅ Expense RESET: Deleted ID ${existingExpense.id} for Member ${memberId}`);

        // 2. 既存の申告がない、または、押されたIDが異なる場合 (新規登録または上書き登録)
        } else {
            // 既存の申告があれば先に削除（常に最新の申告のみを保持する）
            if (existingExpense) {
                 await client.query(
                    `DELETE FROM expenses WHERE id = $1`,
                    [existingExpense.id]
                );
                console.log(`[UPDATE] Deleted old expense ID ${existingExpense.id} for Member ${memberId}`);
            }

            // 新しい申告を挿入
            const insertResult = await client.query(
                `INSERT INTO expenses (member_id, member_name, declaration_type_id)
                 VALUES ($1, $2, $3)
                 RETURNING id, created_at`, 
                [memberId, memberName, declaration_type_id]
            );
            
            newActiveExpense = {
                id: insertResult.rows[0].id,
                declarationTypeId: declaration_type_id,
                memberName: memberName,
                createdAt: insertResult.rows[0].created_at,
            };
            operation = 'DECLARE';
            console.log(`✅ Expense DECLARED: New ID ${newActiveExpense.id} for Member ${memberId}`);
        }
        
        await client.query('COMMIT'); // トランザクション完了

        // 応答
        res.status(200).json({ 
            message: operation === 'RESET' 
                ? "Expense successfully reset (deleted)." 
                : "Expense successfully declared (or updated).",
            operation: operation,
            activeExpense: newActiveExpense // リセット時は null, 登録時は新しいオブジェクト
        });


    } catch (error) {
        await client.query('ROLLBACK'); // エラー時はロールバック
        console.error("❌ Failed to process expense (DECLARE/RESET):", error.message);
        res.status(500).json({ message: "Internal Server Error: Failed to process expense in DB." });
    } finally {
        if (client) {
            client.release();
        }
    }
});


// サーバーの起動 (app.listen は変更なし)
app.listen(PORT, () => {
    console.log(`✅ Express server running on http://localhost:${PORT}`);
});