// js/config.js - 設定とユーティリティ関数（手動制御対応版）

/**
 * アプリケーション全体の設定
 */
export const CONFIG = {
    microcms: {
        // ニュース取得用
        endpoint: '/api/news', // プロキシエンドポイント
        fallbackEnabled: true,
        limit: 3,
        
        // 営業状況管理用（新規追加）
        businessStatusEndpoint: '/api/business-status', // プロキシエンドポイント
        
        // セキュリティ: APIキーはサーバーサイドで管理
        // フロントエンドにはAPIキーを含めない
    },
    ui: {
        animationDuration: 300,
        toastDuration: 3000
    },
    business: {
        openTime: 11,        // 11:00
        closeTime: 21,         // 21:00
        lastOrderTime: 20.5,   // 20:30
        closedDay: 1,          // 月曜日 (0=日曜, 1=月曜...)
        showAdminPanel: false   // 管理者パネル表示（本番環境では false に設定）
    }
};

/**
 * ユーティリティ関数集
 */
export const utils = {
    /**
     * 関数の実行頻度を制限（スクロールイベント最適化）
     */
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },
    
    /**
     * 関数の実行を遅延（リサイズイベント最適化）
     */
    debounce(func, delay) {
        let timeoutId;
        return function() {
            const args = arguments;
            const context = this;
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(context, args), delay);
        };
    },

    /**
     * 日付フォーマット（日本語）
     */
    formatDate(date, options = {}) {
        return new Intl.DateTimeFormat('ja-JP', {
            month: 'numeric',
            day: 'numeric',
            ...options
        }).format(new Date(date));
    },

    /**
     * HTMLエスケープ（XSS対策）
     */
    sanitizeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * 安全なDOM要素取得
     */
    getElementById(id) {
        const element = document.getElementById(id);
        if (!element) {
            console.warn(`Element with id '${id}' not found`);
        }
        return element;
    },

    /**
     * 時間形式変換（17.5 → "17:30"）
     */
    formatTime(timeFloat) {
        const hours = Math.floor(timeFloat);
        const minutes = Math.round((timeFloat - hours) * 60);
        return `${hours}:${minutes.toString().padStart(2, '0')}`;
    },

    /**
     * ローカルストレージ安全操作
     */
    storage: {
        get(key) {
            try {
                return localStorage.getItem(key);
            } catch (error) {
                console.warn('LocalStorage read error:', error);
                return null;
            }
        },
        
        set(key, value) {
            try {
                localStorage.setItem(key, value);
                return true;
            } catch (error) {
                console.warn('LocalStorage write error:', error);
                return false;
            }
        },
        
        remove(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (error) {
                console.warn('LocalStorage remove error:', error);
                return false;
            }
        }
    },

    /**
     * デバッグモード判定
     */
    isDebugMode() {
        return (
            this.storage.get('debug') === 'true' ||
            location.hostname === 'localhost' ||
            location.search.includes('debug=1')
        );
    },

    /**
     * APIエラーメッセージの生成
     */
    getAPIErrorMessage(error) {
        if (!navigator.onLine) {
            return 'インターネット接続を確認してください';
        }
        
        if (error.message?.includes('401')) {
            return '認証エラーが発生しました';
        }
        
        if (error.message?.includes('403')) {
            return 'アクセス権限がありません';
        }
        
        if (error.message?.includes('429')) {
            return 'アクセス制限中です。しばらくお待ちください';
        }
        
        if (error.message?.includes('500')) {
            return 'サーバーエラーが発生しました';
        }
        
        return 'データの読み込みに失敗しました';
    },

    /**
     * 日付文字列をISO形式に変換
     */
    toISOString(date) {
        if (!date) return null;
        
        if (typeof date === 'string') {
            return new Date(date).toISOString();
        }
        
        if (date instanceof Date) {
            return date.toISOString();
        }
        
        return null;
    },

    /**
     * 営業状況のアイコンを取得
     */
    getStatusIcon(statusType) {
        const icons = {
            'open': '🟢',
            'last-order': '🟡',
            'closed': '⚫',
            'holiday': '🔴',
            'emergency-closed': '❌',
            'short-hours': '⏰',
            'special': '✨'
        };
        return icons[statusType] || '⚫';
    },

    /**
     * パフォーマンス測定
     */
    measurePerformance(name, fn) {
        if (!this.isDebugMode()) return fn();
        
        const startTime = performance.now();
        const result = fn();
        const endTime = performance.now();
        
        console.log(`${name} took ${endTime - startTime} milliseconds`);
        return result;
    },

    /**
     * 非同期パフォーマンス測定
     */
    async measurePerformanceAsync(name, fn) {
        if (!this.isDebugMode()) return await fn();
        
        const startTime = performance.now();
        const result = await fn();
        const endTime = performance.now();
        
        console.log(`${name} took ${endTime - startTime} milliseconds`);
        return result;
    },

    /**
     * 営業状況の優先度に基づくソート
     */
    sortBusinessStatusByPriority(statusList) {
        return [...statusList].sort((a, b) => {
            // 優先度が高いほど先頭に
            const priorityA = a.priority || 1;
            const priorityB = b.priority || 1;
            
            if (priorityA !== priorityB) {
                return priorityB - priorityA;
            }
            
            // 優先度が同じ場合は更新日時で並び替え
            return new Date(b.updatedAt) - new Date(a.updatedAt);
        });
    },

    /**
     * 営業状況の有効性チェック
     */
    isBusinessStatusActive(status, now = new Date()) {
        // 開始時刻チェック
        if (status.startTime && new Date(status.startTime) > now) {
            return false;
        }
        
        // 終了時刻チェック
        if (status.endTime && new Date(status.endTime) < now) {
            return false;
        }
        
        return true;
    },

    /**
     * タイムゾーン対応の日時フォーマット
     */
    formatDateTime(date, options = {}) {
        const defaultOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Tokyo'
        };
        
        return new Intl.DateTimeFormat('ja-JP', {
            ...defaultOptions,
            ...options
        }).format(new Date(date));
    },

    /**
     * 文字列の安全な切り詰め
     */
    truncateString(str, maxLength = 50, suffix = '...') {
        if (!str || typeof str !== 'string') return '';
        
        if (str.length <= maxLength) return str;
        
        return str.substring(0, maxLength - suffix.length) + suffix;
    },

    /**
     * クエリパラメータの解析
     */
    parseQueryString(search = window.location.search) {
        const params = new URLSearchParams(search);
        const result = {};
        
        for (const [key, value] of params) {
            result[key] = value;
        }
        
        return result;
    },

    /**
     * Deep clone（循環参照対応）
     */
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => this.deepClone(item));
        if (typeof obj === 'object') {
            const clonedObj = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    clonedObj[key] = this.deepClone(obj[key]);
                }
            }
            return clonedObj;
        }
        return obj;
    },

    /**
     * レスポンシブブレークポイント判定
     */
    getBreakpoint() {
        const width = window.innerWidth;
        
        if (width >= 1200) return 'xl';
        if (width >= 992) return 'lg';
        if (width >= 768) return 'md';
        if (width >= 576) return 'sm';
        return 'xs';
    },

    /**
     * スムーズスクロール（フォールバック付き）
     */
    smoothScrollTo(element, offset = 0) {
        if (!element) return;
        
        const targetPosition = element.getBoundingClientRect().top + window.pageYOffset - offset;
        
        // CSS scroll-behavior対応ブラウザの場合
        if ('scrollBehavior' in document.documentElement.style) {
            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });
        } else {
            // フォールバック：アニメーションによるスクロール
            const startPosition = window.pageYOffset;
            const distance = targetPosition - startPosition;
            const duration = 800;
            let start = null;
            
            function animation(currentTime) {
                if (start === null) start = currentTime;
                const timeElapsed = currentTime - start;
                const progress = Math.min(timeElapsed / duration, 1);
                
                // Easing function (ease-out)
                const ease = 1 - Math.pow(1 - progress, 3);
                
                window.scrollTo(0, startPosition + distance * ease);
                
                if (timeElapsed < duration) {
                    requestAnimationFrame(animation);
                }
            }
            
            requestAnimationFrame(animation);
        }
    }
};