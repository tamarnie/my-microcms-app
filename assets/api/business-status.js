// api/business-status.js - Vercel Functions用の営業状況管理API

/**
 * MicroCMS 営業状況APIのプロキシエンドポイント
 * セキュリティ: APIキーをサーバーサイドで管理
 */
export default async function handler(req, res) {
    // CORS設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    
    // プリフライトリクエスト対応
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // 環境変数からAPIキーとエンドポイントを取得
        const MICROCMS_BUSINESS_STATUS_API_KEY = process.env.MICROCMS_BUSINESS_STATUS_API_KEY;
        const MICROCMS_SERVICE_DOMAIN = process.env.MICROCMS_SERVICE_DOMAIN;
        
        // 環境変数の確認
        if (!MICROCMS_BUSINESS_STATUS_API_KEY || !MICROCMS_SERVICE_DOMAIN) {
            console.error('Business status environment variables not configured');
            throw new Error('サーバー設定エラー');
        }

        // ベースURL
        const baseUrl = `https://${MICROCMS_SERVICE_DOMAIN}.microcms.io/api/v1/emergency-status`;
        
        // リクエストメソッド別の処理
        switch (req.method) {
            case 'GET':
                return await handleGet(req, res, baseUrl, MICROCMS_BUSINESS_STATUS_API_KEY);
            case 'POST':
                return await handlePost(req, res, baseUrl, MICROCMS_BUSINESS_STATUS_API_KEY);
            case 'PATCH':
                return await handlePatch(req, res, baseUrl, MICROCMS_BUSINESS_STATUS_API_KEY);
            case 'DELETE':
                return await handleDelete(req, res, baseUrl, MICROCMS_BUSINESS_STATUS_API_KEY);
            default:
                return res.status(405).json({ 
                    error: 'Method not allowed',
                    message: `${req.method}メソッドはサポートされていません`
                });
        }
        
    } catch (error) {
        console.error('Business Status API Error:', error);
        
        // エラーレスポンス
        const errorResponse = {
            error: 'Business status operation failed',
            message: getErrorMessage(error),
            timestamp: new Date().toISOString()
        };
        
        // 開発環境では詳細なエラー情報を含める
        if (process.env.NODE_ENV === 'development') {
            errorResponse.details = error.message;
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
 * GET: 営業状況一覧取得
 */
async function handleGet(req, res, baseUrl, apiKey) {
    const { limit = 10, offset = 0, filters, orders = '-updatedAt' } = req.query;
    
    // パラメータ検証
    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);
    
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return res.status(400).json({
            error: 'Invalid limit parameter',
            message: 'limitは1-100の範囲で指定してください'
        });
    }
    
    // MicroCMS APIのURL構築
    const params = new URLSearchParams({
        limit: limitNum.toString(),
        offset: offsetNum.toString(),
        orders
    });
    
    if (filters) {
        params.append('filters', filters);
    }
    
    const apiUrl = `${baseUrl}?${params}`;
    
    // MicroCMSにリクエスト
    const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
            'X-MICROCMS-API-KEY': apiKey,
            'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
        // 404の場合は空のレスポンスを返す
        if (response.status === 404) {
            return res.status(200).json({
                contents: [],
                totalCount: 0,
                offset: 0,
                limit: limitNum
            });
        }
        
        const errorText = await response.text();
        console.error(`MicroCMS Business Status API error: ${response.status}`, errorText);
        throw new Error(`API呼び出しエラー: ${response.status}`);
    }

    const data = await response.json();
    
    // データの後処理
    const processedData = {
        contents: data.contents?.map(item => ({
            id: item.id,
            status: sanitizeString(item.status),
            reason: sanitizeString(item.reason),
            message: sanitizeString(item.message),
            priority: item.priority || 1,
            startTime: item.startTime,
            endTime: item.endTime,
            customHours: sanitizeString(item.customHours),
            publishedAt: item.publishedAt,
            updatedAt: item.updatedAt
        })) || [],
        totalCount: data.totalCount || 0,
        offset: data.offset || 0,
        limit: data.limit || limitNum
    };

    // ログ出力（開発時のみ）
    if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Business Status GET: ${processedData.contents.length} items returned`);
    }

    return res.status(200).json(processedData);
}

/**
 * POST: 営業状況新規作成
 */
async function handlePost(req, res, baseUrl, apiKey) {
    // リクエストボディの検証
    const { status, reason, message, priority, startTime, endTime, customHours } = req.body;
    
    if (!status) {
        return res.status(400).json({
            error: 'Invalid request body',
            message: 'statusは必須項目です'
        });
    }
    
    // 有効な営業状況の確認
    const validStatuses = ['closed', 'short', 'special'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({
            error: 'Invalid status value',
            message: `statusは${validStatuses.join(', ')}のいずれかを指定してください`
        });
    }
    
    // リクエストデータの準備
    const requestData = {
        status: sanitizeString(status),
        reason: sanitizeString(reason) || '',
        message: sanitizeString(message) || '',
        priority: parseInt(priority) || 1,
        startTime: startTime || new Date().toISOString(),
        endTime: endTime || null,
        customHours: sanitizeString(customHours) || null
    };
    
    // MicroCMSにリクエスト
    const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
            'X-MICROCMS-API-KEY': apiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData),
        signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`MicroCMS POST error: ${response.status}`, errorText);
        throw new Error(`営業状況の作成に失敗しました: ${response.status}`);
    }

    const result = await response.json();
    
    // ログ出力（開発時のみ）
    if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Business Status POST: Created ${result.id}`);
    }

    return res.status(201).json({
        id: result.id,
        message: '営業状況を設定しました',
        data: requestData,
        timestamp: new Date().toISOString()
    });
}

/**
 * PATCH: 営業状況更新
 */
async function handlePatch(req, res, baseUrl, apiKey) {
    const contentId = req.query.id;
    
    if (!contentId) {
        return res.status(400).json({
            error: 'Missing content ID',
            message: '更新対象のIDが指定されていません'
        });
    }
    
    const { status, reason, message, priority, startTime, endTime, customHours } = req.body;
    
    // 更新データの準備
    const updateData = {};
    if (status !== undefined) updateData.status = sanitizeString(status);
    if (reason !== undefined) updateData.reason = sanitizeString(reason);
    if (message !== undefined) updateData.message = sanitizeString(message);
    if (priority !== undefined) updateData.priority = parseInt(priority);
    if (startTime !== undefined) updateData.startTime = startTime;
    if (endTime !== undefined) updateData.endTime = endTime;
    if (customHours !== undefined) updateData.customHours = sanitizeString(customHours);
    
    // MicroCMSにリクエスト
    const response = await fetch(`${baseUrl}/${contentId}`, {
        method: 'PATCH',
        headers: {
            'X-MICROCMS-API-KEY': apiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData),
        signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`MicroCMS PATCH error: ${response.status}`, errorText);
        
        if (response.status === 404) {
            return res.status(404).json({
                error: 'Content not found',
                message: '指定された営業状況が見つかりません'
            });
        }
        
        throw new Error(`営業状況の更新に失敗しました: ${response.status}`);
    }

    const result = await response.json();
    
    // ログ出力（開発時のみ）
    if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Business Status PATCH: Updated ${contentId}`);
    }

    return res.status(200).json({
        id: result.id,
        message: '営業状況を更新しました',
        data: updateData,
        timestamp: new Date().toISOString()
    });
}

/**
 * DELETE: 営業状況削除
 */
async function handleDelete(req, res, baseUrl, apiKey) {
    const contentId = req.query.id;
    
    if (!contentId) {
        return res.status(400).json({
            error: 'Missing content ID',
            message: '削除対象のIDが指定されていません'
        });
    }
    
    // MicroCMSにリクエスト
    const response = await fetch(`${baseUrl}/${contentId}`, {
        method: 'DELETE',
        headers: {
            'X-MICROCMS-API-KEY': apiKey
        },
        signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`MicroCMS DELETE error: ${response.status}`, errorText);
        
        if (response.status === 404) {
            return res.status(404).json({
                error: 'Content not found',
                message: '指定された営業状況が見つかりません'
            });
        }
        
        throw new Error(`営業状況の削除に失敗しました: ${response.status}`);
    }
    
    // ログ出力（開発時のみ）
    if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Business Status DELETE: Deleted ${contentId}`);
    }

    return res.status(200).json({
        message: '営業状況を削除しました',
        deletedId: contentId,
        timestamp: new Date().toISOString()
    });
}

/**
 * 文字列のサニタイズ
 * @param {string} str - サニタイズする文字列
 * @returns {string} サニタイズされた文字列
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return str;
    
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/[\x00-\x1F\x7F]/g, '')
        .substring(0, 1000); // 営業状況メッセージは短めに制限
}

/**
 * エラーメッセージの取得
 * @param {Error} error - エラーオブジェクト
 * @returns {string} ユーザー向けエラーメッセージ
 */
function getErrorMessage(error) {
    const message = error.message || 'Unknown error';
    
    const messageMap = {
        '認証エラー': 'サービスの認証に失敗しました',
        'アクセス権限エラー': 'データへのアクセス権限がありません',
        'データが見つかりません': '要求されたデータが見つかりません',
        'リクエスト制限に達しました': 'アクセス制限中です。しばらくお待ちください',
        'MicroCMSサーバーエラー': 'データサービスで問題が発生しています',
        'サーバー設定エラー': 'サーバーの設定に問題があります'
    };
    
    for (const [key, value] of Object.entries(messageMap)) {
        if (message.includes(key)) {
            return value;
        }
    }
    
    return '営業状況の操作に失敗しました。しばらくしてから再度お試しください';
}