// api/news.js - Vercel Functions用のニュース取得API（CORS設定改善版）

/**
 * MicroCMS ニュースAPIのプロキシエンドポイント
 * セキュリティ: APIキーをサーバーサイドで管理 + CORS制限
 */
export default async function handler(req, res) {
    try {
        // CORS設定（環境変数で制御）
        const allowedOrigin = getAllowedOrigin(req);
        setCorsHeaders(res, allowedOrigin);
        
        // プリフライトリクエスト対応
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        // GETリクエストのみ許可
        if (req.method !== 'GET') {
            return res.status(405).json({ 
                error: 'Method not allowed',
                message: 'このエンドポイントはGETリクエストのみ対応しています'
            });
        }

        // 環境変数チェック
        const { apiKey, serviceDomain } = validateEnvironmentVariables();

        // クエリパラメータを取得・検証
        const { 
            limit = 10, 
            offset = 0, 
            filters, 
            orders = '-publishedAt',
            fields 
        } = req.query;
        
        // パラメータ検証
        const limitNum = parseInt(limit);
        const offsetNum = parseInt(offset);
        
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
            return res.status(400).json({
                error: 'Invalid limit parameter',
                message: 'limitは1-100の範囲で指定してください'
            });
        }
        
        if (isNaN(offsetNum) || offsetNum < 0) {
            return res.status(400).json({
                error: 'Invalid offset parameter',
                message: 'offsetは0以上の数値を指定してください'
            });
        }

        // MicroCMS APIのURL構築
        const params = new URLSearchParams({
            limit: limitNum.toString(),
            offset: offsetNum.toString(),
            orders
        });
        
        // オプションパラメータの追加
        if (filters) {
            params.append('filters', filters);
        }
        
        if (fields) {
            params.append('fields', fields);
        }
        
        const apiUrl = `https://${serviceDomain}.microcms.io/api/v1/news?${params}`;
        
        // MicroCMSにリクエスト
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'X-MICROCMS-API-KEY': apiKey,
                'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(10000)
        });

        // レスポンス確認
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`MicroCMS API error: ${response.status} ${response.statusText}`, errorText);
            
            // ステータスコード別のエラーハンドリング
            switch (response.status) {
                case 401:
                    throw new Error('認証エラー');
                case 403:
                    throw new Error('アクセス権限エラー');
                case 404:
                    throw new Error('データが見つかりません');
                case 429:
                    throw new Error('リクエスト制限に達しました');
                case 500:
                case 502:
                case 503:
                    throw new Error('MicroCMSサーバーエラー');
                default:
                    throw new Error(`API呼び出しエラー: ${response.status}`);
            }
        }

        const data = await response.json();
        
        // データの後処理とセキュリティ（サニタイズ）
        const processedData = {
            contents: data.contents?.map(item => ({
                id: item.id,
                title: sanitizeString(item.title),
                content: sanitizeString(item.content),
                description: sanitizeString(item.description),
                category: sanitizeString(item.category),
                publishedAt: item.publishedAt,
                updatedAt: item.updatedAt,
                // 画像がある場合のみ含める
                ...(item.image && { image: item.image })
            })) || [],
            totalCount: data.totalCount || 0,
            offset: data.offset || 0,
            limit: data.limit || limitNum
        };

        // レスポンス情報をログ出力（開発時のみ）
        if (process.env.NODE_ENV === 'development') {
            console.log(`✅ News API: ${processedData.contents.length} items returned`);
        }

        return res.status(200).json(processedData);
        
    } catch (error) {
        return handleError(error, req, res);
    }
}

/**
 * 許可されたオリジンを取得
 */
function getAllowedOrigin(req) {
    const requestOrigin = req.headers.origin;
    const allowedOrigin = process.env.ALLOWED_ORIGIN;
    
    // 環境変数が設定されていない場合
    if (!allowedOrigin) {
        // 開発環境ではリクエスト元を許可
        if (process.env.NODE_ENV === 'development') {
            return requestOrigin || '*';
        }
        // 本番環境では警告を出すが、動作は継続
        console.warn('⚠️ ALLOWED_ORIGIN環境変数が未設定です。セキュリティリスクがあります。');
        return requestOrigin || '*';
    }
    
    // カンマ区切りで複数ドメインに対応
    const allowedOrigins = allowedOrigin.split(',').map(o => o.trim());
    
    // リクエスト元が許可リストに含まれているか確認
    if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
        return requestOrigin;
    }
    
    // デフォルトとして最初の許可オリジンを返す
    return allowedOrigins[0];
}

/**
 * CORSヘッダーを設定
 */
function setCorsHeaders(res, allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24時間
    
    // キャッシュ設定（ニュースは5分間キャッシュ可能）
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    
    // セキュリティヘッダー
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
}

/**
 * 環境変数の検証
 */
function validateEnvironmentVariables() {
    const apiKey = process.env.MICROCMS_API_KEY;
    const serviceDomain = process.env.MICROCMS_SERVICE_DOMAIN;
    
    if (!apiKey || !serviceDomain) {
        console.error('Environment variables not configured');
        throw new Error('サーバー設定エラー');
    }
    
    return { apiKey, serviceDomain };
}

/**
 * 文字列のサニタイズ（XSS対策）
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return str;
    
    // 基本的なHTMLエスケープ
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        // 制御文字を除去
        .replace(/[\x00-\x1F\x7F]/g, '')
        // 過度に長い文字列を制限
        .substring(0, 10000);
}

/**
 * エラーハンドリング
 */
function handleError(error, req, res) {
    console.error('News API Error:', error);
    
    // エラーレスポンス
    const errorResponse = {
        error: 'Failed to fetch news',
        message: getErrorMessage(error),
        timestamp: new Date().toISOString()
    };
    
    // 開発環境では詳細なエラー情報を含める
    if (process.env.NODE_ENV === 'development') {
        errorResponse.details = error.message;
        errorResponse.stack = error.stack;
    }
    
    // エラーの種類に応じたステータスコード
    let statusCode = 500;
    if (error.message.includes('認証')) statusCode = 401;
    if (error.message.includes('権限')) statusCode = 403;
    if (error.message.includes('見つかりません')) statusCode = 404;
    if (error.message.includes('制限')) statusCode = 429;
    if (error.message.includes('設定')) statusCode = 500;
    
    return res.status(statusCode).json(errorResponse);
}

/**
 * エラーメッセージの取得
 */
function getErrorMessage(error) {
    const message = error.message || 'Unknown error';
    
    // ユーザーフレンドリーなメッセージに変換
    const messageMap = {
        '認証エラー': 'サービスの認証に失敗しました',
        'アクセス権限エラー': 'データへのアクセス権限がありません',
        'データが見つかりません': '要求されたデータが見つかりません',
        'リクエスト制限に達しました': 'アクセス制限中です。しばらくお待ちください',
        'MicroCMSサーバーエラー': 'データサービスで問題が発生しています',
        'サーバー設定エラー': 'サーバーの設定に問題があります'
    };
    
    // マッピングされたメッセージがあれば使用
    for (const [key, value] of Object.entries(messageMap)) {
        if (message.includes(key)) {
            return value;
        }
    }
    
    // デフォルトメッセージ
    return 'データの取得に失敗しました。しばらくしてから再度お試しください';
}
