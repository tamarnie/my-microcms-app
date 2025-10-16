// js/event-manager.js - イベント管理クラス

/**
 * イベントリスナーの一元管理
 * メモリリーク防止のため、登録したイベントを追跡・削除
 */
export class EventManager {
    constructor() {
        this.listeners = [];
        this.abortController = new AbortController();
    }

    /**
     * イベントリスナーを追加
     * @param {Element|Window|Document} element - 対象要素
     * @param {string} event - イベント名
     * @param {Function} handler - ハンドラー関数
     * @param {Object} options - オプション
     */
    add(element, event, handler, options = {}) {
        if (!element || typeof handler !== 'function') {
            console.warn('Invalid parameters for event listener');
            return;
        }

        // AbortControllerを使用してイベントを管理
        const finalOptions = {
            ...options,
            signal: this.abortController.signal
        };

        element.addEventListener(event, handler, finalOptions);
        
        // 手動削除用に記録も保持
        this.listeners.push({ element, event, handler, options: finalOptions });
    }

    /**
     * 特定のイベントリスナーを削除
     * @param {Element|Window|Document} element - 対象要素
     * @param {string} event - イベント名
     * @param {Function} handler - ハンドラー関数
     */
    remove(element, event, handler) {
        element.removeEventListener(event, handler);
        
        // 記録からも削除
        this.listeners = this.listeners.filter(listener => 
            !(listener.element === element && 
              listener.event === event && 
              listener.handler === handler)
        );
    }

    /**
     * 全てのイベントリスナーを削除
     */
    cleanup() {
        // AbortControllerで一括削除
        this.abortController.abort();
        
        // 手動でも削除（保険）
        this.listeners.forEach(({ element, event, handler, options }) => {
            try {
                element.removeEventListener(event, handler, options);
            } catch (error) {
                console.warn('Error removing event listener:', error);
            }
        });
        
        this.listeners = [];
        
        // 新しいAbortControllerを作成
        this.abortController = new AbortController();
    }

    /**
     * 登録されているイベントリスナーの数を取得
     */
    getListenerCount() {
        return this.listeners.length;
    }

    /**
     * デバッグ用：登録されているイベント一覧を表示
     */
    debug() {
        console.group('EventManager Debug');
        console.log(`Total listeners: ${this.listeners.length}`);
        
        const eventTypes = {};
        this.listeners.forEach(({ event }) => {
            eventTypes[event] = (eventTypes[event] || 0) + 1;
        });
        
        console.table(eventTypes);
        console.groupEnd();
    }
}