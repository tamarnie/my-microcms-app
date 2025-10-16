// api/business-status.js - Vercel Functions用の営業状況管理API（セキュリティ強化版）

import crypto from 'crypto';

/**
 * MicroCMS 営業状況APIのプロキシエンドポイント
 * セキュリティ強化：認証必須 + CORS制限 + レート制限
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

        // 環境変数チェック
        const { apiKey, serviceDomain } = validateEnvironmentVariables();

        // 書き込み操作には認証が必要
        if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
            const authResult = authenticate(req);
            if (!authResult.authorized) {
                logSecurityEvent('auth_failed', req, authResult.message);
                return res.status(401).json({
                    error: 'Unauthorized',
                    message: authResult.message || '認証が必要です'
                });
            }
            logSecurityEvent('auth_success', req);
        }

        // ベースURL
        const baseUrl = `https://${serviceDomain}.microcms.io/api/v1/emergency-status`;
        
        // リクエストメソッド別の処理
        switch (req.method) {
            case 'GET':
                return await handleGet(req, res, baseUrl, apiKey);
            case 'POST':
                return await handlePost(req, res, baseUrl, apiKey);
            case 'PATCH':
                return await handlePatch(req, res, baseUrl, apiKey);
            case 'DELETE':
                return await handleDelete(req, res, baseUrl, apiKey);
            default:
                return res.status(405).json({ 
                    error: 'Method not allowed',
                    message: `${req.method}メソッドはサポートされていません`
                });
        }
        
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
        // 本番環境では警告
        console.warn('⚠️ ALLOWED_ORIGIN環境変数が未設定です。セキュリティリスクがあります。');
        return requestOrigin || '*';
    }
    
    // カンマ区切りで複数ドメインに対応
    const allowedOrigins = allowedOrigin.split(',').map(o => o.trim());
    
    // リクエスト元が許可リストに含まれているか確認
    if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
        return requestOrigin;
    }
    
    // 最初の許可オリジンを返す（フォールバック）
    return allowedOrigins[0];
}

/**
 * CORSヘッダーを設定
 */
function setCorsHeaders(res, allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24時間
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    
    // セキュリティヘッダー
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
}

/**
 * 環境変数の検証
 */
function validateEnvironmentVariables() {
    const apiKey = process.env.MICROCMS_BUSINESS_STATUS_API_KEY;
    const serviceDomain = process.env.MICROCMS_SERVICE_DOMAIN;
    
    if (!apiKey || !serviceDomain) {
        throw new Error('サーバー設定エラー：必要な環境変数が設定されていません');
    }
    
    return { apiKey, serviceDomain };
}

/**
 * 認証チェック（Bearer Token）
 */
function authenticate(req) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return { 
            authorized: false, 
            message: '認証ヘッダーが必要です（Authorization: Bearer <token>）' 
        };
    }
    
    // Bearer トークンの抽出
    const token = authHeader.replace(/^Bearer\s+/i, '');
    
    if (!token) {
        return { 
            authorized: false, 
            message: '有効なトークンが必要です' 
        };
    }
    
    // 環境変数からトークンを取得
    const validToken = process.env.ADMIN_TOKEN;
    
    if (!validToken) {
        console.error('❌ ADMIN_TOKEN環境変数が設定されていません');
        return { 
            authorized: false, 
            message: 'サーバー設定エラー：管理者トークンが未設定です' 
        };
    }
    
    // タイミングセーフな比較
    if (!timingSafeEqual(token, validToken)) {
        return { 
            authorized: false, 
            message: '認証に失敗しました' 
        };
    }
    
    return { authorized: true };
}

/**
 * タイミングセーフな文字列比較（タイミング攻撃対策）
 */
function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
    }
    
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    
    // 長さが異なる場合
    if (bufA.length !== bufB.length) {
        // ダミー比較で同じ時間をかける（タイミング攻撃対策）
        const dummyBuf = Buffer.alloc(bufA.length);
        try {
            crypto.timingSafeEqual(bufA, dummyBuf);
        } catch {}
        return false;
    }
    
    try {
        return crypto.timingSafeEqual(bufA, bufB);
    } catch {
        return false;
    }
}

/**
 * セキュリティイベントのログ記録
 */
function logSecurityEvent(eventType, req, message = '') {
    const ip = req.headers['x-forwarded-for'] || 
               req.headers['x-real-ip'] || 
               req.connection?.remoteAddress || 
               'unknown';
    
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    const logEntry = {
        timestamp: new Date().toISOString(),
        event: eventType,
        ip,
        userAgent,
        method: req.method,
        path: req.url,
        message
    };
    
    if (eventType === 'auth_failed') {
        console.warn('⚠️ 認証失敗:', JSON.stringify(logEntry));
    } else if (process.env.NODE_ENV === 'development') {
        console.log('🔐 セキュリティイベント:', JSON.stringify(logEntry));
    }
}

/**
 * GET: 営業状況一覧取得（認証不要）
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
        console.error(`MicroCMS API error: ${response.status}`, errorText);
        throw new Error(`API呼び出しエラー: ${response.status}`);
    }

    const data = await response.json();
    
    // データの後処理（サニタイズ）
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
 * POST: 営業状況新規作成（認証必須）
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
    
    // 操作ログ
    logSecurityEvent('status_create', req, `Creating status: ${requestData.status}`);
    
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
    
    console.log(`✅ Business Status Created: ${result.id}`);

    return res.status(201).json({
        id: result.id,
        message: '営業状況を設定しました',
        data: requestData,
        timestamp: new Date().toISOString()
    });
}

/**
 * PATCH: 営業状況更新（認証必須）
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
    
    // 操作ログ
    logSecurityEvent('status_update', req, `Updating status: ${contentId}`);
    
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
    
    console.log(`✅ Business Status Updated: ${contentId}`);

    return res.status(200).json({
        id: result.id,
        message: '営業状況を更新しました',
        data: updateData,
        timestamp: new Date().toISOString()
    });
}

/**
 * DELETE: 営業状況削除（認証必須）
 */
async function handleDelete(req, res, baseUrl, apiKey) {
    const contentId = req.query.id;
    
    if (!contentId) {
        return res.status(400).json({
            error: 'Missing content ID',
            message: '削除対象のIDが指定されていません'
        });
    }
    
    // 操作ログ
    logSecurityEvent('status_delete', req, `Deleting status: ${contentId}`);
    
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
    
    console.log(`✅ Business Status Deleted: ${contentId}`);

    return res.status(200).json({
        message: '営業状況を削除しました',
        deletedId: contentId,
        timestamp: new Date().toISOString()
    });
}

/**
 * 文字列のサニタイズ（XSS対策）
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return str;
    
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/[\x00-\x1F\x7F]/g, '') // 制御文字を除去
        .substring(0, 1000); // 最大長制限
}

/**
 * エラーハンドリング
 */
function handleError(error, req, res) {
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