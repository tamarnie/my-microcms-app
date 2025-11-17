// js/business-hours.js - 営業時間管理クラス（手動制御対応版）

import { CONFIG, utils } from './config.js';

/**
 * 営業時間・店舗状況の管理（手動制御機能付き）
 */
export class BusinessHours {
    constructor() {
        this.config = CONFIG.business;
        this.statusCache = null;
        this.lastUpdate = null;
        this.lastCMSCheck = null;

        // 設定
        this.cmsCheckInterval = 30000;
        this.cacheTimeout = 300000;
    }

    /**
     * 初期化
     */
    async init() {
        // STEP1: プリレンダリングされたキャッシュを即座に読み込み
        try {
            const cacheResponse = await fetch('/data/business-status-cache.json');
            if (cacheResponse.ok) {
                const cacheData = await cacheResponse.json();

                // キャッシュが5分以内なら使用
                const cacheAge = Date.now() - new Date(cacheData.fetchedAt).getTime();
                if (cacheAge < 5 * 60 * 1000 && cacheData.contents) {
                    const activeOverride = this.findActiveOverride(cacheData.contents);
                    if (activeOverride) {
                        this.manualOverride = activeOverride;
                        console.log('📦 Using pre-rendered cache');
                    }
                }
            }
        } catch (e) {
            console.log('No pre-rendered cache available');
        }

        // STEP2: LocalStorageもチェック（フォールバック）
        if (!this.manualOverride) {
            try {
                const cached = localStorage.getItem('businessOverride');
                if (cached) {
                    const data = JSON.parse(cached);
                    if (!data.endTime || new Date(data.endTime) > new Date()) {
                        this.manualOverride = data;
                        console.log('💾 Using localStorage cache');
                    }
                }
            } catch (e) {
                // Silent fail
            }
        }

        // STEP3: 即座に表示（キャッシュがあれば手動設定、なければ自動判定）
        this.updateStatus();
        this.displayUI();

        // STEP4: 管理者パネル（既存の機能を維持）
        if (this.config.showAdminPanel) {
            this.createAdminPanel();
        }

        // STEP5: バックグラウンドで最新データを取得（非ブロッキング）
        this.refreshInBackground();
    }
    /**
     * バックグラウンドで最新データを更新
     */
    async refreshInBackground() {
        // 100ms待ってから最新データ取得（UIを優先）
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            // 既存のcheckManualOverrideを使用
            await this.checkManualOverride(true);
        } catch (error) {
            console.warn('Background refresh failed:', error);
        }
    }

    /**
     * スムーズな更新アニメーション
     */
    smoothUpdate() {
        const statusBar = document.getElementById('statusBar');
        if (statusBar) {
            statusBar.style.transition = 'opacity 0.3s';
            statusBar.style.opacity = '0.7';

            setTimeout(() => {
                this.updateStatus();
                statusBar.style.opacity = '1';
            }, 150);
        }
    }

    /**
     * UI要素の表示
     */
    displayUI() {
        const statusBar = document.getElementById('statusBar');
        if (statusBar) {
            statusBar.style.display = 'block';
            statusBar.style.opacity = '1';
            statusBar.classList.add('visible');
        }

        const newsBanner = document.getElementById('newsBanner');
        if (newsBanner) {
            newsBanner.style.display = 'block';
            newsBanner.style.position = 'fixed';
            newsBanner.style.top = '50px';
            newsBanner.style.width = '100%';
            newsBanner.style.zIndex = '999';
            newsBanner.textContent = 'お子様ランチ始めました';
        }
    }

    /**
     * MicroCMSから手動設定をチェック
     */
    async checkManualOverride(forceRefresh = false) {
        try {
            // キャッシュチェック
            if (!forceRefresh && this.lastCMSCheck &&
                Date.now() - this.lastCMSCheck < this.cacheTimeout) {
                return;
            }

            // MicroCMSクライアントを使用
            if (window.app && window.app.microCMS) {
                const data = await window.app.microCMS.loadBusinessStatus();
                this.lastCMSCheck = Date.now();

                // 有効な手動設定があるかチェック
                const activeOverride = this.findActiveOverride(data);

                if (activeOverride !== this.manualOverride) {
                    this.manualOverride = activeOverride;

                    // LocalStorageの更新
                    if (activeOverride) {
                        localStorage.setItem('businessOverride', JSON.stringify(activeOverride));
                        console.log('✅ Saved to LocalStorage:', activeOverride);
                    } else {
                        // データがない場合は必ずLocalStorageをクリア
                        localStorage.removeItem('businessOverride');
                        console.log('🗑️ Cleared LocalStorage (no data)');
                    }

                    this.updateStatus();
                    console.log('Manual override updated:', activeOverride);
                }
            }
        } catch (error) {
            console.warn('MicroCMS接続エラー:', error.message);
            // エラー時もLocalStorageをクリア
            localStorage.removeItem('businessOverride');
            if (this.manualOverride) {
                this.manualOverride = null;
                this.updateStatus();
            }
        }
    }

    /**
     * 有効な手動設定を検索
     * @param {Array} contents - MicroCMSコンテンツ配列
     * @returns {Object|null} 有効な手動設定
     */
    findActiveOverride(contents) {
        if (!contents || contents.length === 0) {
            return null;
        }

        const now = new Date();

        // 優先度順にソートして最も優先度の高い有効な設定を取得
        const validOverrides = contents
            .filter(item => {
                // 公開状態チェック
                if (!item.publishedAt) return false;

                // 開始時刻チェック
                if (item.startTime && new Date(item.startTime) > now) {
                    return false;
                }

                // 終了時刻チェック
                if (item.endTime && new Date(item.endTime) < now) {
                    return false;
                }

                return true;
            })
            .sort((a, b) => (b.priority || 1) - (a.priority || 1));

        return validOverrides.length > 0 ? validOverrides[0] : null;
    }

    /**
     * 営業状況を更新
     * @param {Date} customDate - カスタム日時（テスト用）
     */
    updateStatus(customDate = null) {
        const now = customDate || new Date();

        // 手動設定が優先
        let status;
        if (this.manualOverride) {
            status = this.createManualStatus(this.manualOverride, now);
        } else {
            status = this.calculateAutoStatus(now);
        }

        // 前回と同じ状況なら表示は更新しない
        if (this.statusCache &&
            this.statusCache.type === status.type &&
            this.statusCache.message === status.message &&
            this.statusCache.isManual === status.isManual) {
            return;
        }

        this.statusCache = status;
        this.lastUpdate = now;
        this.displayStatus(status);

        // カスタムイベントを発火
        this.emitStatusChange(status);
    }

    /**
     * 手動設定から営業状況を作成
     * @param {Object} override - 手動設定オブジェクト
     * @param {Date} now - 現在時刻
     * @returns {Object} 営業状況オブジェクト
     */

    createManualStatus(override, now) {
        // statusが配列の場合、最初の要素を取得
        const statusValue = Array.isArray(override.status) ? override.status[0] : override.status;

        const baseStatus = {
            isManual: true,
            overrideId: override.id,
            reason: override.reason || '',
            customMessage: override.message || '',
            startTime: override.startTime,
            endTime: override.endTime
        };


        switch (statusValue) {
            case 'closed':
                return {
                    ...baseStatus,
                    type: 'emergency-closed',
                    message: '臨時休業',
                    detail: override.reason || '都合により臨時休業',
                    customMessage: override.message || '営業再開時期は改めてお知らせいたします'
                };

            case 'short':
                return {
                    ...baseStatus,
                    type: 'short-hours',
                    message: '時短営業',
                    detail: override.reason || '本日は時短営業',
                    customMessage: override.message || '',  // customMessageとして設定
                    customHours: override.customHours || ''
                };

            case 'special':
                return {
                    ...baseStatus,
                    type: 'special',
                    message: '特別営業',
                    detail: override.message || '本日は特別営業',
                    specialNote: override.reason || ''
                };

            default:
                // 不明な設定の場合は自動判定にフォールバック
                console.warn('Unknown manual status:', statusValue);
                return this.calculateAutoStatus(now);
        }

    }

    /**
     * 自動営業状況を計算（元のロジック）
     * @param {Date} date - 基準日時
     * @returns {Object} 営業状況オブジェクト
     */
    calculateAutoStatus(date) {
        const day = date.getDay();
        const hour = date.getHours();
        const minute = date.getMinutes();
        const time = hour + minute / 60;

        const baseStatus = { isManual: false };

        // 祝日チェック
        if (this.isHoliday(date)) {
            return {
                ...baseStatus,
                type: 'holiday',
                message: '祝日のため休業',
                detail: '翌営業日17:30より営業',
                nextOpen: this.getNextOpenTime(date)
            };
        }

        // 定休日チェック
        if (day === this.config.closedDay) {
            return {
                ...baseStatus,
                type: 'closed',
                message: '本日定休日',
                detail: '明日17:30より営業',
                nextOpen: this.getNextOpenTime(date)
            };
        }

        // 営業時間内チェック
        if (time >= this.config.openTime && time < this.config.lastOrderTime) {
            const remainingMinutes = Math.round((this.config.lastOrderTime - time) * 60);
            return {
                ...baseStatus,
                type: 'open',
                message: '営業中',
                detail: `${utils.formatTime(this.config.closeTime)}まで（L.O. ${utils.formatTime(this.config.lastOrderTime)}）`,
                remainingMinutes
            };
        } else if (time >= this.config.lastOrderTime && time < this.config.closeTime) {
            return {
                ...baseStatus,
                type: 'last-order',
                message: 'ラストオーダー',
                detail: '本日のご注文受付は終了',
                closingTime: this.config.closeTime
            };
        } else if (time < this.config.openTime) {
            const minutesToOpen = Math.round((this.config.openTime - time) * 60);
            return {
                ...baseStatus,
                type: 'closed',
                message: '準備中',
                detail: `本日${utils.formatTime(this.config.openTime)}より営業`,
                minutesToOpen
            };
        } else {
            return {
                ...baseStatus,
                type: 'closed',
                message: '営業終了',
                detail: `明日${utils.formatTime(this.config.openTime)}より営業`,
                nextOpen: this.getNextOpenTime(date)
            };
        }
    }

    /**
     * 営業状況を画面に表示
     * @param {Object} status - 営業状況オブジェクト
     */
    displayStatus(status) {
        const badge = utils.getElementById('statusBadge');
        const detail = utils.getElementById('statusDetail');

        if (!badge || !detail) {
            console.warn('Status display elements not found');
            return;
        }

        const icons = {
            'open': '🟢',
            'last-order': '🟡',
            'closed': '⚫',
            'holiday': '🔴',
            'emergency-closed': '❌',
            'short-hours': '⏰',
            'special': '✨'
        };

        // バッジの更新
        const icon = icons[status.type] || '⚫';
        badge.className = `status-badge ${status.type}`;
        badge.innerHTML = `${icon} ${status.message}`;

        // 手動設定の場合は視覚的に区別
        if (status.isManual) {
            badge.classList.add('manual-override');
        }

        // 詳細の更新
        let detailText = status.detail;
        // specialタイプの場合はcustomMessageを追加しない
        if (status.type !== 'special' && status.customMessage) {
            detailText += ` - ${status.customMessage}`;
        }
        if (status.nextMessage) {
            detailText += ` ${status.nextMessage}`;
        }
        detail.textContent = detailText;

        // 手動設定の場合は追加情報を表示
        this.displayManualInfo(status);

        // カウントダウン表示
        this.updateCountdown(status);
    }

    /**
     * 手動設定の追加情報を表示
     * @param {Object} status - 営業状況オブジェクト
     */
    displayManualInfo(status) {
        const manualInfo = utils.getElementById('manualInfo');
        if (!manualInfo) return;

        // 常に非表示にする
        manualInfo.style.display = 'none';
    }

    /**
     * 管理者パネルを作成
     */
    createAdminPanel() {
        // 管理者パネルのHTML要素を作成
        const panel = document.createElement('div');
        panel.id = 'adminPanel';
        panel.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            border: 2px solid #007bff;
            border-radius: 8px;
            padding: 15px;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-width: 300px;
            display: none;
        `;

        panel.innerHTML = `
            <h4 style="margin: 0 0 10px 0; color: #007bff;">営業状況管理</h4>
            <div style="margin-bottom: 10px;">
                <select id="manualStatus" style="width: 100%; padding: 5px;">
                    <option value="">自動判定</option>
                    <option value="closed">臨時休業</option>
                    <option value="short">時短営業</option>
                    <option value="special">特別営業</option>
                </select>
            </div>
            <div style="margin-bottom: 10px;">
                <input type="text" id="manualReason" placeholder="理由" style="width: 100%; padding: 5px;">
            </div>
            <div style="margin-bottom: 10px;">
                <input type="text" id="manualMessage" placeholder="メッセージ" style="width: 100%; padding: 5px;">
            </div>
            <div style="margin-bottom: 10px;">
                <input type="datetime-local" id="manualEndTime" style="width: 100%; padding: 5px;">
            </div>
            <div style="display: flex; gap: 5px;">
                <button id="applyManual" style="flex: 1; padding: 8px; background: #007bff; color: white; border: none; border-radius: 4px;">適用</button>
                <button id="clearManual" style="flex: 1; padding: 8px; background: #dc3545; color: white; border: none; border-radius: 4px;">クリア</button>
            </div>
            <div id="manualResult" style="margin-top: 10px; font-size: 12px;"></div>
        `;

        document.body.appendChild(panel);

        // イベントリスナーを設定
        this.setupAdminPanelEvents(panel);

        // 管理者パネル表示のキーボードショートカット (Ctrl+Shift+A)
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'A') {
                e.preventDefault();
                const isVisible = panel.style.display !== 'none';
                panel.style.display = isVisible ? 'none' : 'block';
            }
        });
    }

    /**
     * 管理者パネルのイベントを設定
     * @param {HTMLElement} panel - パネル要素
     */
    setupAdminPanelEvents(panel) {
        const applyBtn = panel.querySelector('#applyManual');
        const clearBtn = panel.querySelector('#clearManual');
        const resultDiv = panel.querySelector('#manualResult');

        applyBtn.addEventListener('click', async () => {
            const status = panel.querySelector('#manualStatus').value;
            const reason = panel.querySelector('#manualReason').value;
            const message = panel.querySelector('#manualMessage').value;
            const endTime = panel.querySelector('#manualEndTime').value;

            if (!status) {
                resultDiv.textContent = 'ステータスを選択してください';
                resultDiv.style.color = 'red';
                return;
            }

            const overrideData = {
                status,
                reason,
                message,
                endTime: endTime ? new Date(endTime).toISOString() : null
            };

            const result = await this.setManualOverride(overrideData);
            resultDiv.textContent = result.message;
            resultDiv.style.color = result.success ? 'green' : 'red';
        });

        clearBtn.addEventListener('click', async () => {
            const result = await this.clearManualOverride();
            resultDiv.textContent = result.message;
            resultDiv.style.color = result.success ? 'green' : 'red';

            // フォームをクリア
            panel.querySelector('#manualStatus').value = '';
            panel.querySelector('#manualReason').value = '';
            panel.querySelector('#manualMessage').value = '';
            panel.querySelector('#manualEndTime').value = '';
        });
    }

    /**
     * 手動で営業状況を設定（管理者用）
     * @param {Object} overrideData - 手動設定データ
     */
    async setManualOverride(overrideData) {
        try {
            if (window.app && window.app.microCMS) {
                await window.app.microCMS.setBusinessStatus(overrideData);

                // 即座にチェックして反映
                await this.checkManualOverride();

                return { success: true, message: '手動設定を適用しました' };
            } else {
                throw new Error('MicroCMS client not available');
            }

        } catch (error) {
            console.error('Manual override failed:', error);
            return { success: false, message: `設定に失敗しました: ${error.message}` };
        }
    }

    /**
     * 手動設定をクリア
     */
    async clearManualOverride() {
        try {
            // ローカルの手動設定をクリア
            this.manualOverride = null;
            this.updateStatus();

            return { success: true, message: '手動設定をクリアしました' };

        } catch (error) {
            console.error('Clear override failed:', error);
            return { success: false, message: `クリアに失敗しました: ${error.message}` };
        }
    }

    // 既存のメソッドを維持
    updateCountdown(status) {
        const countdown = utils.getElementById('statusCountdown');
        if (!countdown) return;

        if (status.remainingMinutes && status.remainingMinutes > 0) {
            countdown.textContent = `ラストオーダーまで ${status.remainingMinutes}分`;
            countdown.style.display = 'block';
        } else if (status.minutesToOpen && status.minutesToOpen > 0) {
            countdown.textContent = `開店まで ${status.minutesToOpen}分`;
            countdown.style.display = 'block';
        } else if (status.isManual && status.endTime) {
            const now = new Date();
            const end = new Date(status.endTime);
            const diffMs = end - now;
            if (diffMs > 0) {
                const hours = Math.floor(diffMs / 3600000);
                const minutes = Math.floor((diffMs % 3600000) / 60000);
                countdown.textContent = `手動設定解除まで ${hours}時間${minutes}分`;
                countdown.style.display = 'block';
            } else {
                countdown.style.display = 'none';
            }
        } else {
            countdown.style.display = 'none';
        }
    }

    getNextOpenTime(currentDate) {
        const nextOpen = new Date(currentDate);

        do {
            nextOpen.setDate(nextOpen.getDate() + 1);
        } while (nextOpen.getDay() === this.config.closedDay || this.isHoliday(nextOpen));

        const hours = Math.floor(this.config.openTime);
        const minutes = Math.round((this.config.openTime - hours) * 60);
        nextOpen.setHours(hours, minutes, 0, 0);

        return nextOpen;
    }

    isHoliday(date) {
        const month = date.getMonth() + 1;
        const day = date.getDate();

        if ((month === 12 && day >= 29) || (month === 1 && day <= 3)) {
            return true;
        }

        return false;
    }

    emitStatusChange(status) {
        const event = new CustomEvent('businessStatusChange', {
            detail: {
                status,
                timestamp: Date.now(),
                isManual: status.isManual
            }
        });
        document.dispatchEvent(event);
    }

    getCurrentStatus() {
        return this.statusCache;
    }

    getManualOverride() {
        return this.manualOverride;
    }

    isOpen(date = new Date()) {
        const status = this.manualOverride ?
            this.createManualStatus(this.manualOverride, date) :
            this.calculateAutoStatus(date);
        return status.type === 'open' || status.type === 'last-order' || status.type === 'special';
    }

    getTodaySchedule(date = new Date()) {
        const day = date.getDay();

        if (day === this.config.closedDay || this.isHoliday(date)) {
            return {
                isOpenDay: false,
                reason: day === this.config.closedDay ? '定休日' : '祝日'
            };
        }

        return {
            isOpenDay: true,
            openTime: utils.formatTime(this.config.openTime),
            closeTime: utils.formatTime(this.config.closeTime),
            lastOrderTime: utils.formatTime(this.config.lastOrderTime)
        };
    }

    getWeeklySchedule() {
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        const schedule = [];

        for (let i = 0; i < 7; i++) {
            if (i === this.config.closedDay) {
                schedule.push({
                    day: days[i],
                    dayOfWeek: i,
                    status: '定休日',
                    openTime: null,
                    closeTime: null
                });
            } else {
                schedule.push({
                    day: days[i],
                    dayOfWeek: i,
                    status: '営業',
                    openTime: utils.formatTime(this.config.openTime),
                    closeTime: utils.formatTime(this.config.closeTime),
                    lastOrderTime: utils.formatTime(this.config.lastOrderTime)
                });
            }
        }

        return schedule;
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.updateStatus();
    }

    debug() {
        console.group('BusinessHours Debug');
        console.log('Config:', this.config);
        console.log('Current status:', this.statusCache);
        console.log('Manual override:', this.manualOverride);
        console.log('Last update:', this.lastUpdate);
        console.log('Last CMS check:', this.lastCMSCheck);
        console.log('Weekly schedule:', this.getWeeklySchedule());
        console.groupEnd();
    }
}