-- expense_app_db 用のテーブル作成スクリプト

-- 既存のテーブルを削除（初回実行時やクリーンアップ用）
DROP TABLE IF EXISTS expenses;
DROP TABLE IF EXISTS declaration_types;
DROP TABLE IF EXISTS members;


-- ----------------------------------------------------
-- 1. members テーブル (ユーザー情報)
-- ----------------------------------------------------
-- REQ-004 (Google認証)、REQ-005 (ユーザー識別) に対応
CREATE TABLE IF NOT EXISTS members (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,    -- Google認証用アドレス (ログイン可否の判定に使用)
    name VARCHAR(100) NOT NULL,            -- 表示名
    is_report_target BOOLEAN DEFAULT TRUE, -- ⭐ NEW: 集計対象フラグ (TRUEなら集計対象)
    is_admin BOOLEAN DEFAULT FALSE,        -- 管理者権限の有無 (データ修正ボタンの表示制御に使用)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------
-- 2. declaration_types テーブル (申告の分類)
-- ----------------------------------------------------
-- REQ-002 (3分類のみ) に対応
CREATE TABLE IF NOT EXISTS declaration_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL, -- 分類名（「通常の立替あり」など）
    icon_name VARCHAR(50),             -- アイコン表示用 (将来的なUI用)
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------
-- 3. expenses テーブル (申告データ)
-- ----------------------------------------------------
-- REQ-003 (分類を選択し、申告ボタンを押すだけで完了) に準拠
-- REQ-006 (日時、ログインユーザーのIDと名前を自動取得) に準拠
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    member_id INT REFERENCES members(id) ON DELETE CASCADE,           -- 申告したメンバーID (REQ-006)
    member_name VARCHAR(100) NOT NULL,                               -- ⭐ NEW: 申告時の名前（履歴用）
    declaration_type_id INT REFERENCES declaration_types(id) ON DELETE SET NULL, -- 申告分類 (REQ-002)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP      -- REQ-006: 日時を自動記録
);


-- ----------------------------------------------------
-- 4. 初期データの挿入
-- ----------------------------------------------------

-- 申告分類の初期データ (REQ-002: 3分類のみ)
INSERT INTO declaration_types (name, icon_name) VALUES
('通常の立替あり', 'hand-holding-dollar')
ON CONFLICT (name) DO NOTHING;

INSERT INTO declaration_types (name, icon_name) VALUES
('客先立替あり', 'building')
ON CONFLICT (name) DO NOTHING;

INSERT INTO declaration_types (name, icon_name) VALUES
('立替なし', 'circle-check')
ON CONFLICT (name) DO NOTHING;

-- ⭐ ⭐ ⭐ 認証用メンバーの初期データ挿入 ⭐ ⭐ ⭐
-- ここに、あなたがログインに使用するGoogleアカウントのメールアドレスを挿入してください。
-- 初期管理者として登録することで、アプリケーションへのアクセスが可能になります。
INSERT INTO members (email, name, is_admin)
VALUES ('y.nagashima@white-library.com', '長島陽春', TRUE)
ON CONFLICT (email) DO NOTHING;