// api/news.js - Vercel Functions用のニュース取得API

/**
 * MicroCMS ニュースAPIのプロキシエンドポイント
 * セキュリティ: APIキーをサーバーサイドで管理
 */
export default async function handler(req, res) {
    // CORS設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    
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

    try {
        // 環境変数からAPIキーとエンドポイントを取得
        const MICROCMS_API_KEY = process.env.MICROCMS_API_KEY;
        const MICROCMS_SERVICE_DOMAIN = process.env.MICROCMS_SERVICE_DOMAIN;
        
        // 環境変数の確認
        if (!MICROCMS_API_KEY || !MICROCMS_SERVICE_DOMAIN) {
            console.error('Environment variables not configured');
            throw new Error('サーバー設定エラー');
        }

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
        
        const apiUrl = `https://${MICROCMS_SERVICE_DOMAIN}.microcms.io/api/v1/news?${params}`;
        
        // MicroCMSにリクエスト
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'X-MICROCMS-API-KEY': MICROCMS_API_KEY,
                'Content-Type': 'application/json'
            },
            // タイムアウト設定（10秒）
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
        
        // データの後処理とセキュリティ
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
}

/**
 * 文字列のサニタイズ
 * @param {string} str - サニタイズする文字列
 * @returns {string} サニタイズされた文字列
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
 * エラーメッセージの取得
 * @param {Error} error - エラーオブジェクト
 * @returns {string} ユーザー向けエラーメッセージ
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

/**
 * リクエストのログ出力（デバッグ用）
 * @param {Object} req - リクエストオブジェクト
 */
function logRequest(req) {
    if (process.env.NODE_ENV === 'development') {
        console.log(`📰 News API Request:`, {
            method: req.method,
            query: req.query,
            userAgent: req.headers['user-agent'],
            ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            timestamp: new Date().toISOString()
        });
    }
}