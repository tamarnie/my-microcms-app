// js/microcms-client.js - MicroCMS連携クラス（営業状況API対応版）

import { CONFIG, utils } from './config.js';

/**
 * MicroCMS API連携とデータ管理
 * ニュース取得 + 営業状況管理機能
 */
export class MicroCMSClient {
    constructor() {
        this.cache = new Map();
        this.retryCount = 0;
        this.maxRetries = 3;
        this.abortController = null;
    }

    /**
     * 初期化
     */
    async init() {
        // キャッシュクリア（必要に応じて）
        this.clearExpiredCache();
    }

    /**
     * ニュースデータを取得（既存機能）
     * @param {boolean} showLoading - ローディング表示するか
     * @param {boolean} forceRefresh - キャッシュを無視して強制更新
     */
    async loadNews(showLoading = true, forceRefresh = false) {
        try {
            if (showLoading) {
                this.showLoading();
            }

            // 進行中のリクエストをキャンセル
            if (this.abortController) {
                this.abortController.abort();
            }
            this.abortController = new AbortController();

            // キャッシュチェック（5分間有効）
            const cacheKey = 'news';
            const cached = this.cache.get(cacheKey);
            if (!forceRefresh && cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
                this.renderNews(cached.data);
                return cached.data;
            }

            const response = await this.fetchWithRetry(
                CONFIG.microcms.endpoint,
                {
                    signal: this.abortController.signal
                }
            );
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            // データ検証
            if (!data.contents || !Array.isArray(data.contents)) {
                throw new Error('Invalid data format received');
            }

            // キャッシュに保存
            this.cache.set(cacheKey, {
                data: data.contents,
                timestamp: Date.now()
            });

            this.renderNews(data.contents);
            this.retryCount = 0; // リセット
            
            return data.contents;

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Request aborted');
                return;
            }
            await this.handleError(error, showLoading);
        } finally {
            if (showLoading) {
                this.hideLoading();
            }
            this.abortController = null;
        }
    }

    /**
     * 営業状況データを取得（新規追加）
     * @param {boolean} forceRefresh - キャッシュを無視して強制更新
     */
    async loadBusinessStatus(forceRefresh = false) {
        try {
            // キャッシュチェック（30秒間有効）
            const cacheKey = 'businessStatus';
            const cached = this.cache.get(cacheKey);
            if (!forceRefresh && cached && Date.now() - cached.timestamp < 30 * 1000) {
                return cached.data;
            }

            const response = await this.fetchWithRetry(CONFIG.microcms.businessStatusEndpoint);
            
            if (!response.ok) {
                // 404エラーの場合は空の配列を返す（設定がない場合）
                if (response.status === 404) {
                    console.info('No business status configured');
                    return [];
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            // データ検証
            if (!data.contents || !Array.isArray(data.contents)) {
                console.warn('Invalid business status data format, using empty array');
                return [];
            }

            // キャッシュに保存
            this.cache.set(cacheKey, {
                data: data.contents,
                timestamp: Date.now()
            });

            console.log(`Loaded ${data.contents.length} business status entries`);
            return data.contents;

        } catch (error) {
            console.error('Business status load error:', error);
            // エラー時は空の配列を返す（フォールバック）
            return [];
        }
    }

    /**
     * 営業状況を設定（新規追加）
     * @param {Object} statusData - 営業状況データ
     */
    async setBusinessStatus(statusData) {
        try {
            const payload = {
                status: statusData.status,
                reason: statusData.reason || '',
                message: statusData.message || '',
                priority: statusData.priority || 10,
                startTime: statusData.startTime || new Date().toISOString(),
                endTime: statusData.endTime || null,
                customHours: statusData.customHours || null
            };

            console.log('Setting business status:', payload);

            // セキュリティ: APIキーはサーバーサイドで管理
            const response = await fetch(CONFIG.microcms.businessStatusEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                    // APIキーはサーバーサイドで付与される
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json();

            // キャッシュをクリアして再読み込みを促す
            this.cache.delete('businessStatus');

            console.log('Business status set successfully:', result);
            return result;

        } catch (error) {
            console.error('Business status set error:', error);
            throw error;
        }
    }

    /**
     * 営業状況を更新（新規追加）
     * @param {string} statusId - 更新する営業状況のID
     * @param {Object} statusData - 更新する営業状況データ
     */
    async updateBusinessStatus(statusId, statusData) {
        try {
            const payload = {
                status: statusData.status,
                reason: statusData.reason || '',
                message: statusData.message || '',
                priority: statusData.priority || 10,
                startTime: statusData.startTime,
                endTime: statusData.endTime,
                customHours: statusData.customHours || null
            };

            const response = await fetch(`${CONFIG.microcms.businessStatusEndpoint}?id=${statusId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json();

            // キャッシュをクリア
            this.cache.delete('businessStatus');

            console.log('Business status updated successfully:', result);
            return result;

        } catch (error) {
            console.error('Business status update error:', error);
            throw error;
        }
    }

    /**
     * 営業状況を削除（新規追加）
     * @param {string} statusId - 削除する営業状況のID
     */
    async deleteBusinessStatus(statusId) {
        try {
            const response = await fetch(`${CONFIG.microcms.businessStatusEndpoint}?id=${statusId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            // キャッシュをクリア
            this.cache.delete('businessStatus');

            console.log('Business status deleted successfully');
            return true;

        } catch (error) {
            console.error('Business status delete error:', error);
            throw error;
        }
    }

    /**
     * 全ての営業状況を削除（緊急時用）
     */
    async clearAllBusinessStatus() {
        try {
            const statusList = await this.loadBusinessStatus(true);
            
            if (statusList.length === 0) {
                console.log('No business status to clear');
                return true;
            }

            // 全ての営業状況を削除
            const deletePromises = statusList.map(status => 
                this.deleteBusinessStatus(status.id).catch(error => {
                    console.warn(`Failed to delete status ${status.id}:`, error);
                    return false;
                })
            );

            const results = await Promise.all(deletePromises);
            const successCount = results.filter(result => result === true).length;

            console.log(`Cleared ${successCount}/${statusList.length} business status entries`);
            return successCount === statusList.length;

        } catch (error) {
            console.error('Clear all business status error:', error);
            throw error;
        }
    }

    /**
     * メニューデータを取得（既存機能）
     * @param {string} category - カテゴリーフィルター
     */
    async loadMenu(category = 'all') {
        try {
            const endpoint = CONFIG.microcms.endpoint.replace('/news', '/menu');
            const url = category === 'all' ? endpoint : `${endpoint}?category=${category}`;
            
            const response = await this.fetchWithRetry(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data.contents || [];
            
        } catch (error) {
            console.error('Menu load error:', error);
            throw error;
        }
    }

    /**
     * リトライ機能付きfetch
     * @param {string} url - リクエストURL
     * @param {Object} options - fetch オプション
     */
    async fetchWithRetry(url, options = {}) {
        let lastError;
        
        for (let i = 0; i <= this.maxRetries; i++) {
            try {
                const response = await fetch(url, {
                    ...options,
                    headers: {
                        'Content-Type': 'application/json',
                        ...options.headers
                    }
                });
                
                return response;
                
            } catch (error) {
                lastError = error;
                
                if (i < this.maxRetries && error.name !== 'AbortError') {
                    // 指数バックオフで再試行
                    const delay = Math.pow(2, i) * 1000;
                    console.log(`Retry ${i + 1}/${this.maxRetries} after ${delay}ms`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    break;
                }
            }
        }
        
        throw lastError;
    }

    /**
     * エラーハンドリング
     * @param {Error} error - エラーオブジェクト
     * @param {boolean} showLoading - ローディング表示中か
     */
    async handleError(error, showLoading) {
        console.error('MicroCMS Error:', error);
        
        if (CONFIG.microcms.fallbackEnabled) {
            this.showFallback();
        } else {
            const message = utils.getAPIErrorMessage(error);
            // グローバルなUIコントローラーに通知
            if (window.app?.ui?.showError) {
                window.app.ui.showError(message);
            }
        }
    }

    /**
     * ニュース一覧を表示（既存機能）
     * @param {Array} newsItems - ニュースアイテム配列
     */
    renderNews(newsItems) {
        const container = utils.getElementById('newsGrid');
        if (!container) return;

        if (!newsItems || newsItems.length === 0) {
            container.innerHTML = '<p class="no-news">現在お知らせはありません</p>';
            return;
        }

        // 最新3件のみ表示
        const latestNews = newsItems.slice(0, CONFIG.microcms.limit);
        container.innerHTML = latestNews.map(item => this.createNewsHTML(item)).join('');
        
        // バナー更新
        if (latestNews[0]) {
            this.updateBanner(latestNews[0]);
        }

        // クリックイベントを追加
        this.attachNewsItemEvents(container);
    }

    /**
     * ニュースアイテムのHTML生成
     * @param {Object} item - ニュースアイテム
     */
    createNewsHTML(item) {
        const date = utils.formatDate(item.publishedAt);
        const categoryName = this.getCategoryName(item.category);
        const badgeClass = this.getBadgeClass(item.category);
        
        // HTMLエスケープ
        const title = utils.sanitizeHtml(item.title);
        const content = utils.sanitizeHtml(item.description || item.content || '');
        
        return `
            <article class="news-item" data-id="${item.id}">
                <div class="news-badge ${badgeClass}">${categoryName}</div>
                <div class="news-content">
                    <h3 class="news-item-title">${title}</h3>
                    <p class="news-item-text">${content}</p>
                    <div class="news-meta">
                        <time datetime="${item.publishedAt}">${date}</time>
                    </div>
                </div>
            </article>
        `;
    }

    /**
     * ニュースアイテムのクリックイベントを設定
     * @param {Element} container - コンテナ要素
     */
    attachNewsItemEvents(container) {
        const newsItems = container.querySelectorAll('.news-item');
        newsItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const newsId = item.dataset.id;
                this.handleNewsItemClick(newsId, e);
            });
        });
    }

    /**
     * ニュースアイテムクリック処理
     * @param {string} newsId - ニュースID
     * @param {Event} event - クリックイベント
     */
    handleNewsItemClick(newsId, event) {
        // 詳細表示やモーダル表示の処理
        console.log('News item clicked:', newsId);
        
        // 必要に応じてカスタムイベントを発火
        const customEvent = new CustomEvent('newsItemClick', {
            detail: { newsId, originalEvent: event }
        });
        document.dispatchEvent(customEvent);
    }

    /**
     * カテゴリーバッジのクラス名を取得
     * @param {string} category - カテゴリー
     */
    getBadgeClass(category) {
        const mapping = {
            'new': 'new',
            'menu': 'menu',
            'event': 'event',
            'notice': 'notice'
        };
        return mapping[category] || 'notice';
    }

    /**
     * カテゴリー名を取得
     * @param {string} category - カテゴリー
     */
    getCategoryName(category) {
        const mapping = {
            'new': '新着',
            'menu': '新メニュー',
            'event': 'イベント',
            'notice': 'お知らせ'
        };
        return mapping[category] || 'お知らせ';
    }

    /**
     * バナーを更新
     * @param {Object} latestNews - 最新ニュース
     */
    updateBanner(latestNews) {
        const banner = utils.getElementById('newsBanner');
        if (banner && latestNews) {
            banner.textContent = latestNews.title;
            banner.classList.add('show');
        }
    }

    /**
     * ローディング表示
     */
    showLoading() {
        const loading = utils.getElementById('newsLoading');
        const grid = utils.getElementById('newsGrid');
        
        if (loading) loading.style.display = 'flex';
        if (grid) grid.style.display = 'none';
    }

    /**
     * ローディング非表示
     */
    hideLoading() {
        const loading = utils.getElementById('newsLoading');
        const grid = utils.getElementById('newsGrid');
        
        if (loading) loading.style.display = 'none';
        if (grid) grid.style.display = 'grid';
    }

    /**
     * フォールバック表示
     */
    showFallback() {
        const fallback = utils.getElementById('fallbackNews');
        const grid = utils.getElementById('newsGrid');
        
        if (fallback) fallback.style.display = 'grid';
        if (grid) grid.style.display = 'none';
    }

    /**
     * 期限切れキャッシュをクリア
     */
    clearExpiredCache() {
        const now = Date.now();
        for (const [key, value] of this.cache) {
            // 営業状況は30秒、ニュースは10分でキャッシュ期限切れ
            const expiry = key === 'businessStatus' ? 30 * 1000 : 10 * 60 * 1000;
            if (now - value.timestamp > expiry) {
                this.cache.delete(key);
                console.log(`Cache expired for: ${key}`);
            }
        }
    }

    /**
     * キャッシュを強制クリア
     */
    clearCache() {
        this.cache.clear();
        console.log('All cache cleared');
    }

    /**
     * 特定のキャッシュを削除
     * @param {string} key - キャッシュキー
     */
    clearCacheKey(key) {
        const deleted = this.cache.delete(key);
        if (deleted) {
            console.log(`Cache cleared for: ${key}`);
        }
        return deleted;
    }

    /**
     * 接続テスト（新規追加）
     */
    async testConnection() {
        try {
            const response = await fetch(CONFIG.microcms.endpoint, {
                method: 'HEAD',
                timeout: 5000
            });
            return response.ok;
        } catch (error) {
            console.warn('Connection test failed:', error);
            return false;
        }
    }

    /**
     * APIの健康状態をチェック（新規追加）
     */
    async healthCheck() {
        const checks = {
            news: false,
            businessStatus: false,
            connection: false
        };

        try {
            // 基本接続テスト
            checks.connection = await this.testConnection();

            // ニュースAPI テスト
            try {
                await this.loadNews(false, true);
                checks.news = true;
            } catch (error) {
                console.warn('News API health check failed:', error);
            }

            // 営業状況API テスト
            try {
                await this.loadBusinessStatus(true);
                checks.businessStatus = true;
            } catch (error) {
                console.warn('Business status API health check failed:', error);
            }

        } catch (error) {
            console.error('Health check error:', error);
        }

        return {
            healthy: Object.values(checks).every(check => check),
            checks,
            timestamp: Date.now()
        };
    }

    /**
     * キャッシュ統計を取得
     */
    getCacheStats() {
        const stats = {
            total: this.cache.size,
            entries: []
        };

        for (const [key, value] of this.cache) {
            const age = Date.now() - value.timestamp;
            const dataSize = JSON.stringify(value.data).length;
            
            stats.entries.push({
                key,
                age: Math.round(age / 1000), // 秒単位
                size: dataSize,
                itemCount: Array.isArray(value.data) ? value.data.length : 1
            });
        }

        return stats;
    }

    /**
     * 営業状況の統計を取得（新規追加）
     */
    async getBusinessStatusStats() {
        try {
            const statusList = await this.loadBusinessStatus();
            
            const stats = {
                total: statusList.length,
                active: 0,
                expired: 0,
                byStatus: {},
                oldest: null,
                newest: null
            };

            const now = new Date();

            statusList.forEach(status => {
                // ステータス別カウント
                stats.byStatus[status.status] = (stats.byStatus[status.status] || 0) + 1;

                // アクティブ/期限切れ判定
                const isActive = utils.isBusinessStatusActive(status, now);
                
                if (isActive) {
                    stats.active++;
                } else {
                    stats.expired++;
                }

                // 最古/最新の更新
                const updatedAt = new Date(status.updatedAt);
                if (!stats.oldest || updatedAt < new Date(stats.oldest.updatedAt)) {
                    stats.oldest = status;
                }
                if (!stats.newest || updatedAt > new Date(stats.newest.updatedAt)) {
                    stats.newest = status;
                }
            });

            return stats;

        } catch (error) {
            console.error('Business status stats error:', error);
            return {
                total: 0,
                active: 0,
                expired: 0,
                byStatus: {},
                error: error.message
            };
        }
    }

    /**
     * 営業状況の一括インポート（管理者用）
     */
    async importBusinessStatus(statusDataArray) {
        if (!Array.isArray(statusDataArray)) {
            throw new Error('Status data must be an array');
        }

        const results = [];
        
        for (const statusData of statusDataArray) {
            try {
                const result = await this.setBusinessStatus(statusData);
                results.push({ success: true, data: result });
            } catch (error) {
                results.push({ success: false, error: error.message, data: statusData });
            }
        }

        return {
            total: statusDataArray.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
        };
    }

    /**
     * デバッグ情報を表示
     */
    debug() {
        console.group('MicroCMSClient Debug');
        console.log('Cache entries:', this.cache.size);
        console.log('Retry count:', this.retryCount);
        console.log('Max retries:', this.maxRetries);
        console.log('Cache stats:', this.getCacheStats());
        
        // 営業状況統計を非同期で表示
        this.getBusinessStatusStats().then(stats => {
            console.log('Business status stats:', stats);
        });
        
        // 健康状態チェック
        this.healthCheck().then(health => {
            console.log('Health check:', health);
        });
        
        console.groupEnd();
    }
}