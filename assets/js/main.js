// js/main.js - メインアプリケーションクラスと初期化（手動制御対応版）

import { CONFIG } from './config.js';
import { EventManager } from './event-manager.js';
import { TimerManager } from './timer-manager.js';
import { MicroCMSClient } from './microcms-client.js';
import { BusinessHours } from './business-hours.js';
import { UIController } from './ui-controller.js';
import { initSwiper } from './swiper.js';

document.addEventListener('DOMContentLoaded', function() {
    const swiper = initSwiper();
});

/**
 * メインアプリケーションクラス
 * 全ての機能を統合・管理（手動制御機能付き）
 */
class TorimaruApp {
    constructor() {
        // 各種マネージャーとコントローラーの初期化
        this.eventManager = new EventManager();
        this.timerManager = new TimerManager();
        this.microCMS = new MicroCMSClient();
        this.businessHours = new BusinessHours();
        this.ui = new UIController();
        
        // 初期化状態の管理
        this.isInitialized = false;
        this.initializationError = null;
        
        // デバッグモード
        this.debugMode = this.isDebugMode();
    }

    /**
     * アプリケーション初期化
     */
    async init() {
        try {
            console.log('🚀 TorimaruApp initialization started...');
            
            // DOM要素の確認
            if (!this.checkRequiredElements()) {
                throw new Error('必要なDOM要素が見つかりません');
            }

            // 各コンポーネントの初期化（並列実行）
            await Promise.all([
                this.microCMS.init(),
                this.businessHours.init(), // 手動制御機能含む
                this.ui.init()
            ]);
            
            // イベントリスナーの設定
            this.setupEventListeners();
            
            // 定期実行タスクの設定（手動制御システム対応）
            this.setupTimers();
            
            // 初期データの読み込み
            await this.loadInitialData();
            
            // 初期化完了
            this.isInitialized = true;
            console.log('✅ TorimaruApp initialized successfully');
            
            // 初期化完了イベントを発火
            this.emitInitialized();
            
        } catch (error) {
            this.initializationError = error;
            console.error('❌ Initialization failed:', error);
            this.ui.showError('アプリケーションの初期化に失敗しました');
            
            // フォールバック表示
            this.showFallbackContent();
        }
    }

    /**
     * 必要なDOM要素の存在確認
     * @returns {boolean} 全ての必要な要素が存在するか
     */
    checkRequiredElements() {
        const required = [
            'statusBar',       // ステータスバー
            'statusBadge',     // ステータスバッジ  
            'statusDetail'     // ステータス詳細
        ];
        
        // オプション要素（あれば使用、なくてもエラーにしない）
        const optional = [
            'newsGrid',        // ニュース表示エリア
            'newsBanner',      // ニュースバナー
            'manualInfo',      // 手動設定情報表示
            'statusCountdown'  // カウントダウン表示
        ];
        
        const missing = required.filter(id => !document.getElementById(id));
        
        if (missing.length > 0) {
            console.warn('Missing required elements:', missing);
            return false;
        }
        
        // オプション要素の存在確認（警告のみ）
        const missingOptional = optional.filter(id => !document.getElementById(id));
        if (missingOptional.length > 0) {
            console.info('Optional elements not found (will be skipped):', missingOptional);
        }
        
        return true;
    }

    /**
     * イベントリスナーの設定
     */
    setupEventListeners() {
        // スクロールイベント（パフォーマンス最適化）
        const throttledScroll = this.createThrottledScrollHandler();
        this.eventManager.add(window, 'scroll', throttledScroll, { passive: true });
        
        // リサイズイベント
        const debouncedResize = this.createDebouncedResizeHandler();
        this.eventManager.add(window, 'resize', debouncedResize);
        
        // ネットワーク状態の監視
        this.setupNetworkListeners();
        
        // カスタムイベントリスナー
        this.setupCustomEventListeners();
        
        // ページ離脱時の処理
        this.eventManager.add(window, 'beforeunload', () => {
            this.beforeUnload();
        });

        // ページ表示状態の監視（手動制御システム用）
        this.setupVisibilityChangeListener();
    }

    /**
     * ページ表示状態変更の監視設定（新規追加）
     */
    setupVisibilityChangeListener() {
        this.eventManager.add(document, 'visibilitychange', () => {
            if (!document.hidden) {
                // ページが再表示された時に営業状況をチェック
                console.log('Page became visible, checking business status...');
                this.businessHours.checkManualOverride();
            }
        });
    }

    /**
     * スクロールハンドラーの作成（throttled）
     */
    createThrottledScrollHandler() {
        let ticking = false;
        
        return () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    this.ui.updateScrollState();
                    this.ui.updateActiveNav();
                    ticking = false;
                });
                ticking = true;
            }
        };
    }

    /**
     * リサイズハンドラーの作成（debounced）
     */
    createDebouncedResizeHandler() {
        let timeoutId;
        
        return () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                this.ui.handleResize();
            }, 250);
        };
    }

    /**
     * ネットワーク状態の監視設定
     */
    setupNetworkListeners() {
        this.eventManager.add(window, 'online', () => {
            this.handleOnline();
        });
        
        this.eventManager.add(window, 'offline', () => {
            this.handleOffline();
        });
    }

    /**
     * カスタムイベントリスナーの設定
     */
    setupCustomEventListeners() {
        // 営業状況変更イベント（手動制御対応）
        this.eventManager.add(document, 'businessStatusChange', (e) => {
            this.handleBusinessStatusChange(e.detail);
        });
        
        // セクション変更イベント
        this.eventManager.add(document, 'sectionChange', (e) => {
            this.handleSectionChange(e.detail);
        });
        
        // ニュースアイテムクリックイベント
        this.eventManager.add(document, 'newsItemClick', (e) => {
            this.handleNewsItemClick(e.detail);
        });
    }

    /**
     * 定期実行タスクの設定（手動制御システム対応）
     */
    setupTimers() {
        // 営業状況の更新（30秒ごと）
        this.timerManager.add('businessStatus', () => {
            this.businessHours.updateStatus();
        }, 30000, false);

        // 手動設定のチェック（30秒ごと）- 新規追加
        this.timerManager.add('manualOverrideCheck', () => {
            this.businessHours.checkManualOverride();
        }, 30000, false);

        // ニュースの更新（5分ごと、サイレント）
        this.timerManager.add('newsUpdate', () => {
            this.microCMS.loadNews(false);
        }, 5 * 60 * 1000, false);

        // キャッシュクリーンアップ（10分ごと）
        this.timerManager.add('cacheCleanup', () => {
            this.microCMS.clearExpiredCache();
        }, 10 * 60 * 1000, false);

        // 接続テスト（5分ごと）- 新規追加
        this.timerManager.add('connectionTest', async () => {
            const isOnline = await this.microCMS.testConnection();
            if (!isOnline && navigator.onLine) {
                console.warn('Network connection seems unstable');
            }
        }, 5 * 60 * 1000, false);
    }

    /**
     * 初期データの読み込み
     */
    async loadInitialData() {
        const promises = [
            this.microCMS.loadNews(true),
            this.businessHours.updateStatus(),
            this.businessHours.checkManualOverride() // 手動設定チェックを追加
        ];

        // エラーが発生してもアプリケーションは継続
        const results = await Promise.allSettled(promises);
        
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                const taskNames = ['news loading', 'business status update', 'manual override check'];
                console.warn(`${taskNames[index]} failed:`, result.reason);
            }
        });
    }

    /**
     * オンライン復帰時の処理
     */
    handleOnline() {
        console.log('🌐 Network connection restored');
        this.ui.showSuccess('インターネット接続が復帰しました');
        
        // データを再読み込み
        this.microCMS.loadNews(false, true); // 強制リフレッシュ
        this.businessHours.checkManualOverride(); // 手動設定も再チェック
    }

    /**
     * オフライン時の処理
     */
    handleOffline() {
        console.log('📡 Network connection lost');
        this.ui.showWarning('オフラインモードです。一部機能が制限されます');
    }

    /**
     * 営業状況変更時の処理（手動制御対応）
     * @param {Object} detail - 営業状況詳細
     */
    handleBusinessStatusChange(detail) {
        if (this.debugMode) {
            console.log('📊 Business status changed:', detail.status);
            if (detail.isManual) {
                console.log('🔧 Manual override active');
            }
        }
        
        // 特定の状況での追加処理
        if (detail.status.type === 'open') {
            // 営業開始時の処理
        } else if (detail.status.type === 'last-order') {
            // ラストオーダー時の処理
            this.ui.showWarning('ラストオーダーの時間です');
        } else if (detail.status.type === 'emergency-closed') {
            // 緊急休業時の処理
            console.log('🚨 Emergency closure detected');
        }

        // Google Analytics tracking（実装時に有効化）
        if (typeof gtag !== 'undefined') {
            gtag('event', 'business_status_change', {
                status_type: detail.status.type,
                is_manual: detail.isManual || false,
                timestamp: detail.timestamp
            });
        }
    }

    /**
     * セクション変更時の処理
     * @param {Object} detail - セクション詳細
     */
    handleSectionChange(detail) {
        if (this.debugMode) {
            console.log('📍 Section changed:', detail.sectionId);
        }
        
        // Google Analytics tracking (実装時に有効化)
        if (typeof gtag !== 'undefined') {
            gtag('event', 'section_view', {
                section_id: detail.sectionId,
                timestamp: detail.timestamp
            });
        }
    }

    /**
     * ニュースアイテムクリック時の処理
     * @param {Object} detail - クリック詳細
     */
    handleNewsItemClick(detail) {
        if (this.debugMode) {
            console.log('📰 News item clicked:', detail.newsId);
        }
        
        // 詳細表示の処理（将来的な拡張）
        this.ui.showToast('詳細はお電話でお問い合わせください');
    }

    /**
     * ページ離脱前の処理
     */
    beforeUnload() {
        console.log('👋 Page unloading, cleaning up...');
        // 自動的にdestroy()が呼ばれるので、特別な処理は不要
    }

    /**
     * フォールバックコンテンツの表示
     */
    showFallbackContent() {
        const statusBadge = document.getElementById('statusBadge');
        const statusDetail = document.getElementById('statusDetail');
        
        if (statusBadge && statusDetail) {
            statusBadge.innerHTML = '⚫ システムエラー';
            statusBadge.className = 'status-badge closed';
            statusDetail.textContent = 'お電話でお問い合わせください：052-XXX-XXXX';
        }

        const newsGrid = document.getElementById('newsGrid');
        if (newsGrid) {
            newsGrid.innerHTML = `
                <div class="fallback-content">
                    <h3>お知らせ</h3>
                    <p>最新情報の読み込みに問題が発生しました。</p>
                    <p>お電話でお問い合わせください：052-XXX-XXXX</p>
                </div>
            `;
        }
    }

    /**
     * 初期化完了イベントの発火
     */
    emitInitialized() {
        const event = new CustomEvent('torimaruAppInitialized', {
            detail: {
                timestamp: Date.now(),
                version: '2.0.0', // 手動制御対応版
                features: {
                    manualControl: true,
                    autoStatus: true,
                    newsSystem: true
                }
            }
        });
        document.dispatchEvent(event);
    }

    /**
     * デバッグモードの判定
     * @returns {boolean} デバッグモードかどうか
     */
    isDebugMode() {
        return (
            localStorage.getItem('debug') === 'true' ||
            location.hostname === 'localhost' ||
            location.search.includes('debug=1')
        );
    }

    /**
     * 手動制御システムの状態を取得（新規追加）
     * @returns {Object} 手動制御システムの状態
     */
    getManualControlStatus() {
        return {
            isActive: !!this.businessHours.getManualOverride(),
            override: this.businessHours.getManualOverride(),
            lastCheck: this.businessHours.lastCMSCheck
        };
    }

    /**
     * リソースのクリーンアップ
     */
    destroy() {
        console.log('🧹 Cleaning up TorimaruApp...');
        
        // 各マネージャーのクリーンアップ
        this.eventManager.cleanup();
        this.timerManager.cleanup();
        
        // 管理者パネルを削除
        const panel = document.getElementById('adminPanel');
        if (panel) {
            panel.remove();
        }
        
        // 状態のリセット
        this.isInitialized = false;
        this.initializationError = null;
        
        console.log('✅ TorimaruApp cleanup completed');
    }

    /**
     * アプリケーション状態の取得
     * @returns {Object} 現在の状態
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            error: this.initializationError,
            debugMode: this.debugMode,
            components: {
                microCMS: this.microCMS ? 'loaded' : 'not loaded',
                businessHours: this.businessHours ? 'loaded' : 'not loaded',
                ui: this.ui ? 'loaded' : 'not loaded'
            },
            timers: this.timerManager.getActiveCount(),
            events: this.eventManager.getListenerCount(),
            manualControl: this.getManualControlStatus() // 新規追加
        };
    }

    /**
     * ヘルスチェック（新規追加）
     */
    async healthCheck() {
        const checks = {
            timers: this.timerManager.getActiveCount().total > 0,
            microCMS: await this.microCMS.testConnection(),
            businessHours: !!this.businessHours.getCurrentStatus(),
            ui: !!this.ui
        };

        const healthy = Object.values(checks).every(check => check);
        
        return {
            healthy,
            checks,
            timestamp: Date.now()
        };
    }

    /**
     * デバッグ情報の表示
     */
    debug() {
        console.group('🍗 TorimaruApp Debug Information');
        console.log('Status:', this.getStatus());
        console.log('Health check:', this.healthCheck());
        
        if (this.microCMS) this.microCMS.debug();
        if (this.businessHours) this.businessHours.debug();
        if (this.ui) this.ui.debug();
        if (this.timerManager) this.timerManager.debug();
        if (this.eventManager) this.eventManager.debug();
        
        console.groupEnd();
    }
}

// ===== アプリケーション初期化 =====
let app;

/**
 * DOM読み込み完了時の初期化
 */
document.addEventListener('DOMContentLoaded', async () => {
    try {
        app = new TorimaruApp();
        await app.init();
        
        // グローバルアクセス用（開発・デバッグ時）
        if (typeof window !== 'undefined') {
            window.TorimaruApp = TorimaruApp;
            window.app = app;
            
            // デバッグ用のグローバル関数
            window.debugApp = () => app.debug();
            window.getAppStatus = () => app.getStatus();
            window.healthCheck = () => app.healthCheck();
        }
        
    } catch (error) {
        console.error('Failed to start application:', error);
    }
});

/**
 * ページ離脱時のクリーンアップ
 */
window.addEventListener('beforeunload', () => {
    if (app && typeof app.destroy === 'function') {
        app.destroy();
    }
});

/**
 * エラーハンドリング
 */
window.addEventListener('error', (e) => {
    console.error('Global JavaScript Error:', e.error);
    
    if (app && app.ui) {
        app.ui.showError('システムエラーが発生しました');
    }
});

/**
 * Promise rejection のハンドリング
 */
window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled Promise Rejection:', e.reason);
    
    if (app && app.ui) {
        app.ui.showError('処理中にエラーが発生しました');
    }
});

// ES6モジュールとして公開
export { TorimaruApp };