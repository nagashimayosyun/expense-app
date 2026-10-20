import React, { useState, useEffect, useCallback } from 'react';
import './App.css'; 
import { GoogleLogin, googleLogout } from '@react-oauth/google';
// ------------------------------------------------------------
// 環境変数の定義と基本設定
// ------------------------------------------------------------
// バックエンドのAPIベースURLは vite.config.js で定義
const API_BASE_URL = process.env.VITE_API_BASE_URL;
// Google Client ID (Frontend用)
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// ------------------------------------------------------------
// 型定義
// ------------------------------------------------------------

interface AuthState {
    isAuthenticated: boolean;
    email: string | null;
    name: string | null;
    isLoading: boolean;
    error: string | null;
}

interface DeclarationType {
    id: number;
    name: string;
}

// ⭐ NEW: アクティブな申告データの型
interface ActiveExpense {
    id: number;
    declarationTypeId: number;
    memberName: string;
    createdAt: string;
}

// 申告タイプデータ (DBの declaration_types テーブルに対応)
const DECLARATION_TYPES: DeclarationType[] = [
    { id: 1, name: '通常の立替あり' },
    { id: 2, name: '客先立替あり' },
    { id: 3, name: '立替なし' },
];


// ------------------------------------------------------------
// ExpenseDeclaration Component (申告画面本体)
// ------------------------------------------------------------

interface ExpenseDeclarationProps {
    userName: string;
    onLogout: () => void;
}

const ExpenseDeclaration: React.FC<ExpenseDeclarationProps> = ({ userName, onLogout }) => {
    // ⭐ 変更: 選択中のIDではなく、現在アクティブな申告全体を保持
    const [activeExpense, setActiveExpense] = useState<ActiveExpense | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false); // 申告処理中フラグ

    // ------------------------------------------------------------
    // 1. 現在の申告状態を取得 (マウント時)
    // ------------------------------------------------------------
    const fetchActiveExpense = useCallback(async () => {
        setIsProcessing(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/declare/expense`, {
                method: 'GET',
                credentials: 'include', 
            });

            if (response.ok) {
                const data = await response.json();
                setActiveExpense(data.activeExpense);
                // メッセージは初期化時なのでクリア
                setMessage(null); 
            } else if (response.status === 401) {
                 // 認証切れの場合
                 setMessage('❌ 認証トークンの有効期限が切れました。再ログインしてください。');
                 onLogout(); 
            } else {
                setMessage('❌ 申告状態の取得に失敗しました。');
            }
        } catch (error) {
            console.error('申告状態の取得エラー:', error);
            setMessage('❌ 申告状態の取得中にネットワークエラーが発生しました。');
        } finally {
            setIsProcessing(false);
        }
    }, [onLogout]);

    useEffect(() => {
        // コンポーネント読み込み時に現在の申告状態をロード
        fetchActiveExpense();
    }, [fetchActiveExpense]);


    // ------------------------------------------------------------
    // 2. 申告処理 (即時登録/リセット)
    // ------------------------------------------------------------
    const handleDeclarationToggle = async (typeId: number) => {
        if (isProcessing) return; // 処理中の多重クリック防止

        setIsProcessing(true);
        setMessage('処理中...');
        
        try {
            // POSTリクエストを送り、バックエンドでトグル処理（登録 or 削除）を実行
            const response = await fetch(`${API_BASE_URL}/api/declare/expense`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include', 
                body: JSON.stringify({ 
                    declaration_type_id: typeId,
                }),
            });

            if (response.ok) {
                const result = await response.json();
                
                // APIからの応答に基づき、アクティブな状態を更新
                // (RESETなら null、DECLAREなら新しい ActiveExpense オブジェクトが返される)
                setActiveExpense(result.activeExpense);

                if (result.operation === 'RESET') {
                    setMessage(`✅ 申告がリセットされました。`);
                } else {
                    const typeName = DECLARATION_TYPES.find(t => t.id === typeId)?.name;
                    setMessage(`✅ 「${typeName}」として申告が完了しました！ (ID: ${result.activeExpense?.id})`);
                }

            } else if (response.status === 401) {
                setMessage('❌ 認証トークンの有効期限が切れました。再ログインしてください。');
                onLogout(); 
            } else {
                const errorData = await response.json();
                setMessage(`❌ 申告処理エラー: ${errorData.message || '不明なエラー'}`);
                console.error('申告エラー:', errorData);
            }
        } catch (error) {
            console.error('申告処理中にエラーが発生しました:', error);
            setMessage(`❌ 申告処理中にネットワークエラーが発生しました。`);
        } finally {
            setIsProcessing(false);
        }
    };


    // ------------------------------------------------------------
    // 3. レンダリング
    // ------------------------------------------------------------
    const activeTypeId = activeExpense?.declarationTypeId;

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
            <header className="w-full max-w-lg bg-white shadow-xl rounded-lg p-6 mb-8">
                <div className="flex justify-between items-center">
                    <h1 className="text-3xl font-extrabold text-indigo-700">経費申告システム</h1>
                    <button 
                        onClick={onLogout} 
                        className="text-sm text-gray-500 hover:text-red-500 transition duration-150"
                    >
                        ログアウト
                    </button>
                </div>
                <p className="mt-2 text-gray-600">ようこそ、<span className="font-semibold text-indigo-600">{userName}</span>さん。</p>
            </header>

            <main className="w-full max-w-lg bg-white shadow-2xl rounded-xl p-8">
                <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-2">申告内容の選択 (即時登録/リセット)</h2>
                
                {activeExpense ? (
                     <div className="mb-6 p-3 bg-indigo-50 text-indigo-700 rounded-lg border-l-4 border-indigo-500 text-sm font-medium">
                        <p>現在アクティブな申告: 
                            <span className="font-bold ml-1">
                                {DECLARATION_TYPES.find(t => t.id === activeTypeId)?.name}
                            </span>
                            （タップでリセットされます）
                        </p>
                    </div>
                ) : (
                    <div className="mb-6 p-3 bg-gray-50 text-gray-600 rounded-lg border-l-4 border-gray-300 text-sm font-medium">
                        <p>現在、アクティブな申告はありません。いずれかのボタンをタップして申告してください。</p>
                    </div>
                )}
                
                {/* 申告タイプ選択エリア */}
                <div className="space-y-4">
                    {DECLARATION_TYPES.map(type => {
                        const isSelected = activeTypeId === type.id;
                        
                        return (
                            <button
                                key={type.id}
                                // ⭐ 変更: ボタンクリックで即時登録/リセット処理を呼び出す
                                onClick={() => handleDeclarationToggle(type.id)}
                                disabled={isProcessing} // 処理中は無効化
                                className={`w-full p-4 text-left rounded-lg transition duration-200 shadow-md 
                                    ${isSelected 
                                        ? 'bg-indigo-600 text-white ring-4 ring-indigo-300 transform scale-[1.02]' 
                                        : 'bg-gray-100 text-gray-800 hover:bg-indigo-50 hover:shadow-lg'
                                    }
                                    ${isProcessing ? 'opacity-70 cursor-wait' : ''}
                                `}
                            >
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-lg">{type.name}</span>
                                    {isSelected && (
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                        </svg>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* メッセージ表示エリア */}
                {message && (
                    <div className={`mt-4 p-3 rounded-lg text-center ${message.startsWith('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {message}
                    </div>
                )}
                
                {/* 処理中インジケータ */}
                {isProcessing && (
                    <div className="mt-4 text-center text-indigo-500 font-medium">
                        <svg className="animate-spin h-5 w-5 mr-3 inline text-indigo-500" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        処理を実行しています...
                    </div>
                )}
            </main>
        </div>
    );
};


// ------------------------------------------------------------
// App Component (メインロジック) - 変更なし
// ------------------------------------------------------------
const App: React.FC = () => {
    // 認証状態の管理
    const [authState, setAuthState] = useState<AuthState>({
        isAuthenticated: false,
        email: null,
        name: null,
        isLoading: true,
        error: null,
    });

    // ------------------------------------------------------------
    // 1. 認証ステータスの確認（マウント時とリロード時）
    // ------------------------------------------------------------
    const checkAuthStatus = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/status`, {
                method: 'GET',
                credentials: 'include',
            });

            if (response.ok) {
                const data = await response.json();
                setAuthState({
                    isAuthenticated: true,
                    email: data.email,
                    name: data.name,
                    isLoading: false,
                    error: null,
                });
            } else {
                // トークン無効または期限切れ
                setAuthState(prev => ({ ...prev, isAuthenticated: false, isLoading: false, error: null }));
            }
        } catch (error) {
            console.error('認証ステータスチェック失敗:', error);
            setAuthState(prev => ({ ...prev, isAuthenticated: false, isLoading: false, error: 'ネットワークエラー' }));
        }
    }, []);

    useEffect(() => {
        // コンポーネントマウント時に認証状態を確認
        checkAuthStatus();
        
        // Google One Tap / GSI のクライアントIDを検証
        if (!GOOGLE_CLIENT_ID) {
            console.error("❌ VITE_GOOGLE_CLIENT_ID が設定されていません。");
            setAuthState(prev => ({ ...prev, error: "クライアントIDが設定されていません。" }));
        }
    }, [checkAuthStatus]);


    // ------------------------------------------------------------
    // 2. Google ID トークン処理（コールバック関数）
    // ------------------------------------------------------------
    const handleGoogleResponse = async (response: any) => {
        if (!response.credential) {
            console.error("No credential received from Google.");
            setAuthState(prev => ({ ...prev, error: "Googleからの認証情報がありません。" }));
            return;
        }

        try {
            const apiResponse = await fetch(`${API_BASE_URL}/api/auth/google`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token: response.credential }),
                credentials: 'include',
            });

            if (apiResponse.ok) {
                const data = await apiResponse.json();
                console.log("Authentication success:", data);
                
                // ⭐ ⭐ ⭐ 修正点: 認証成功後、ページを強制リロードして状態を確実に更新する ⭐ ⭐ ⭐
                // これにより、画面が切り替わらない問題を回避します。
                window.location.reload();

                // 以下の setAuthState はリロードされるため、通常は到達しませんが、ロジックとして残します
                setAuthState({
                    isAuthenticated: true,
                    email: data.email,
                    name: data.name, 
                    isLoading: false,
                    error: null, 
                });
            } else {
                const errorData = await apiResponse.json();
                setAuthState(prev => ({ 
                    ...prev, 
                    error: `認証エラー: ${errorData.message}`,
                    isLoading: false 
                }));
                console.error('Authentication API error:', errorData);
            }
        } catch (error) {
            console.error('認証処理中にエラーが発生しました:', error);
            setAuthState(prev => ({ 
                ...prev, 
                error: 'ネットワークエラーまたはサーバーエラー',
                isLoading: false
            }));
        }
    };

    // ------------------------------------------------------------
    // 3. ログアウト処理
    // ------------------------------------------------------------
    const handleLogout = async () => {
        try {
            await fetch(`${API_BASE_URL}/api/auth/logout`, {
                method: 'POST',
                credentials: 'include',
            });
            
            // Google側もログアウト
            googleLogout();
            
            // クライアント側の状態をリセット
            setAuthState({
                isAuthenticated: false,
                email: null,
                name: null,
                isLoading: false,
                error: null,
            });
            console.log("Logged out successfully.");

        } catch (error) {
            console.error('ログアウト中にエラーが発生しました:', error);
            // エラーが発生しても、クライアント側の状態はリセットしておく
            setAuthState(prev => ({ ...prev, isAuthenticated: false, name: null, email: null }));
        }
    };


    // ------------------------------------------------------------
    // 4. コンテンツのレンダリング
    // ------------------------------------------------------------
    const renderContent = () => {
        if (authState.isLoading) {
            return (
                <div className="min-h-screen flex items-center justify-center">
                    <p className="text-xl text-gray-500">認証ステータスを確認中...</p>
                </div>
            );
        }

        // 認証成功時: 申告画面を表示
        if (authState.isAuthenticated && authState.name) {
            return <ExpenseDeclaration userName={authState.name} onLogout={handleLogout} />;
        }

        // 未認証またはエラー時: 認証画面を表示
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
                <div className="bg-white p-8 rounded-xl shadow-2xl max-w-sm w-full text-center">
                    <h1 className="text-3xl font-extrabold text-indigo-600 mb-6">経費申告アプリ (認証)</h1>
                    
                    {authState.error && (
                        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6 text-sm" role="alert">
                            <strong className="font-bold">エラー: </strong>
                            <span className="block sm:inline">{authState.error}</span>
                        </div>
                    )}
                    
                    <p className="text-gray-600 mb-6">ログインするには、Googleアカウントで認証を行ってください。</p>

                    {/* Google One Tap / Button (GSI) のレンダリング */}
                    {GOOGLE_CLIENT_ID ? (
                        <GoogleLogin
                            onSuccess={handleGoogleResponse}
                            onError={() => {
                                console.error('Google Login Failed');
                                setAuthState(prev => ({ ...prev, error: "Google認証プロセス中にエラーが発生しました。" }));
                            }}
                            useOneTap={true} 
                            auto_select={false} // One Tap で自動選択を強制しない
                            // size, theme, text, width などのGsiButtonConfigurationプロパティは、<GoogleOAuthProvider>の外側で使用される場合に必要だが、
                            // ReactコンポーネントとしてラップされたGoogleLoginでは不要な場合があるため、一旦削除
                        />
                    ) : (
                        <p className="text-red-500 font-bold">クライアントIDが未設定のため認証ボタンを表示できません。</p>
                    )}
                    
                    <p className="mt-6 text-xs text-gray-400">認証には、DBに登録済みのメールアドレスが必要です。</p>
                </div>
            </div>
        );
    };

    return (
        <div className="app-container">
            {renderContent()}
            {/* GSIライブラリは App.tsx が <GoogleOAuthProvider> でラップされているため利用可能 */}
        </div>
    );
};

export default App;