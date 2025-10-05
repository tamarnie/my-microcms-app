// js/timer-manager.js - タイマー管理クラス

/**
 * setInterval/setTimeoutの一元管理
 * メモリリーク防止とパフォーマンス最適化
 */
export class TimerManager {
    constructor() {
        this.timers = new Map();
        this.timeouts = new Map();
    }

    /**
     * 定期実行タイマーを追加
     * @param {string} name - タイマー名（一意）
     * @param {Function} callback - 実行する関数
     * @param {number} interval - 実行間隔（ミリ秒）
     * @param {boolean} immediate - 即座に1回実行するか
     */
    add(name, callback, interval, immediate = false) {
        if (typeof name !== 'string' || typeof callback !== 'function') {
            console.warn('Invalid parameters for timer');
            return false;
        }

        // 既存のタイマーをクリア
        this.remove(name);
        
        // 即座に実行
        if (immediate) {
            try {
                callback();
            } catch (error) {
                console.error(`Timer callback error (${name}):`, error);
            }
        }

        // 定期実行を設定
        const timer = setInterval(() => {
            try {
                callback();
            } catch (error) {
                console.error(`Timer callback error (${name}):`, error);
                // エラーが発生したタイマーは削除
                this.remove(name);
            }
        }, interval);

        this.timers.set(name, {
            timer,
            callback,
            interval,
            startTime: Date.now()
        });

        return true;
    }

    /**
     * 一回限りのタイマーを追加
     * @param {string} name - タイマー名
     * @param {Function} callback - 実行する関数
     * @param {number} delay - 遅延時間（ミリ秒）
     */
    addTimeout(name, callback, delay) {
        if (typeof name !== 'string' || typeof callback !== 'function') {
            console.warn('Invalid parameters for timeout');
            return false;
        }

        // 既存のタイムアウトをクリア
        this.removeTimeout(name);

        const timeout = setTimeout(() => {
            try {
                callback();
            } catch (error) {
                console.error(`Timeout callback error (${name}):`, error);
            } finally {
                // 実行後は自動削除
                this.timeouts.delete(name);
            }
        }, delay);

        this.timeouts.set(name, {
            timeout,
            callback,
            delay,
            startTime: Date.now()
        });

        return true;
    }

    /**
     * 特定のタイマーを削除
     * @param {string} name - タイマー名
     */
    remove(name) {
        const timerData = this.timers.get(name);
        if (timerData) {
            clearInterval(timerData.timer);
            this.timers.delete(name);
            return true;
        }
        return false;
    }

    /**
     * 特定のタイムアウトを削除
     * @param {string} name - タイマー名
     */
    removeTimeout(name) {
        const timeoutData = this.timeouts.get(name);
        if (timeoutData) {
            clearTimeout(timeoutData.timeout);
            this.timeouts.delete(name);
            return true;
        }
        return false;
    }

    /**
     * 全てのタイマーとタイムアウトを削除
     */
    cleanup() {
        // 全ての定期タイマーをクリア
        this.timers.forEach((timerData) => {
            clearInterval(timerData.timer);
        });
        this.timers.clear();

        // 全てのタイムアウトをクリア
        this.timeouts.forEach((timeoutData) => {
            clearTimeout(timeoutData.timeout);
        });
        this.timeouts.clear();
    }

    /**
     * タイマーの一時停止
     * @param {string} name - タイマー名
     */
    pause(name) {
        const timerData = this.timers.get(name);
        if (timerData && !timerData.paused) {
            clearInterval(timerData.timer);
            timerData.paused = true;
            timerData.pausedAt = Date.now();
            return true;
        }
        return false;
    }

    /**
     * タイマーの再開
     * @param {string} name - タイマー名
     */
    resume(name) {
        const timerData = this.timers.get(name);
        if (timerData && timerData.paused) {
            const timer = setInterval(() => {
                try {
                    timerData.callback();
                } catch (error) {
                    console.error(`Timer callback error (${name}):`, error);
                    this.remove(name);
                }
            }, timerData.interval);

            timerData.timer = timer;
            timerData.paused = false;
            delete timerData.pausedAt;
            return true;
        }
        return false;
    }

    /**
     * タイマーの存在確認
     * @param {string} name - タイマー名
     */
    has(name) {
        return this.timers.has(name) || this.timeouts.has(name);
    }

    /**
     * 実行中のタイマー数を取得
     */
    getActiveCount() {
        return {
            intervals: this.timers.size,
            timeouts: this.timeouts.size,
            total: this.timers.size + this.timeouts.size
        };
    }

    /**
     * デバッグ用：タイマー情報を表示
     */
    debug() {
        console.group('TimerManager Debug');
        
        console.log('Intervals:');
        this.timers.forEach((data, name) => {
            const uptime = Date.now() - data.startTime;
            console.log(`  ${name}: ${data.interval}ms interval, running for ${uptime}ms${data.paused ? ' (PAUSED)' : ''}`);
        });

        console.log('Timeouts:');
        this.timeouts.forEach((data, name) => {
            const elapsed = Date.now() - data.startTime;
            const remaining = Math.max(0, data.delay - elapsed);
            console.log(`  ${name}: ${remaining}ms remaining`);
        });

        const counts = this.getActiveCount();
        console.log(`Total: ${counts.intervals} intervals, ${counts.timeouts} timeouts`);
        
        console.groupEnd();
    }
}
