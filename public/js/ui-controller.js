// js/ui-controller.js - UI制御クラス

import { CONFIG, utils } from './config.js';

/**
 * ユーザーインターフェースの制御
 */
export class UIController {
    constructor() {
        this.toast = null;
        this.isScrolling = false;
        this.activeSection = null;
        this.scrollDirection = 'down';
        this.lastScrollY = 0;
    }

    /**
     * 初期化
     */
    init() {
        this.setupToast();
        this.setupScrollIndicator();
        this.setupSmoothScroll();
        this.setupAccessibility();
    }

    /**
     * トースト通知の設定
     */
    setupToast() {
        this.toast = utils.getElementById('toast');
        if (!this.toast) {
            this.createToastElement();
        }
    }

    /**
     * トースト要素を動的作成
     */
    createToastElement() {
        this.toast = document.createElement('div');
        this.toast.id = 'toast';
        this.toast.className = 'toast';
        this.toast.setAttribute('role', 'alert');
        this.toast.setAttribute('aria-live', 'polite');
        document.body.appendChild(this.toast);
    }

    /**
     * スクロールインジケーターの設定
     */
    setupScrollIndicator() {
        // スクロール進捗バーの作成（必要に応じて）
        this.createScrollProgressBar();
    }

    /**
     * スクロール進捗バーを作成
     */
    createScrollProgressBar() {
        const existingBar = document.getElementById('scrollProgress');
        if (existingBar) return;

        const progressBar = document.createElement('div');
        progressBar.id = 'scrollProgress';
        progressBar.className = 'scroll-progress';
        progressBar.innerHTML = '<div class="scroll-progress-fill"></div>';
        document.body.appendChild(progressBar);
    }

    /**
     * スムーズスクロールの設定
     */
    setupSmoothScroll() {
        // アンカーリンクのスムーズスクロール
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href^="#"]');
            if (link) {
                e.preventDefault();
                const targetId = link.getAttribute('href').substring(1);
                this.smoothScrollTo(targetId);
            }
        });
    }

    /**
     * アクセシビリティの設定
     */
    setupAccessibility() {
        // キーボードナビゲーション
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardNavigation(e);
        });

        // フォーカス管理
        this.setupFocusManagement();
    }

    /**
     * キーボードナビゲーションの処理
     * @param {KeyboardEvent} e - キーボードイベント
     */
    handleKeyboardNavigation(e) {
        // Escキーでモーダルやトーストを閉じる
        if (e.key === 'Escape') {
            this.closeAllModals();
        }

        // Tabキーでのフォーカス移動を制御
        if (e.key === 'Tab') {
            this.handleTabNavigation(e);
        }
    }

    /**
     * フォーカス管理の設定
     */
    setupFocusManagement() {
        // フォーカス可能な要素のスタイル調整
        const style = document.createElement('style');
        style.textContent = `
            .focus-visible {
                outline: 2px solid #007acc;
                outline-offset: 2px;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * トースト通知を表示
     * @param {string} message - メッセージ
     * @param {number} duration - 表示時間（ミリ秒）
     * @param {string} type - 通知タイプ（info, success, warning, error）
     */
    showToast(message, duration = CONFIG.ui.toastDuration, type = 'info') {
        if (!this.toast || !message) return;

        // 既存のトーストをクリア
        this.hideToast();

        // アイコンを追加
        const icon = this.getToastIcon(type);
        this.toast.innerHTML = `${icon} ${message}`;
        this.toast.className = `toast toast-${type}`;
        this.toast.classList.add('show');

        // 自動的に非表示
        setTimeout(() => {
            this.hideToast();
        }, duration);

        // アクセシビリティ用
        this.announceToScreenReader(message);
    }

    /**
     * トーストアイコンを取得
     * @param {string} type - 通知タイプ
     * @returns {string} アイコン
     */
    getToastIcon(type) {
        const icons = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        };
        return icons[type] || icons.info;
    }

    /**
     * エラートーストを表示
     * @param {string} message - エラーメッセージ
     * @param {number} duration - 表示時間
     */
    showError(message, duration = 5000) {
        this.showToast(message, duration, 'error');
    }

    /**
     * 成功トーストを表示
     * @param {string} message - 成功メッセージ
     * @param {number} duration - 表示時間
     */
    showSuccess(message, duration = 3000) {
        this.showToast(message, duration, 'success');
    }

    /**
     * 警告トーストを表示
     * @param {string} message - 警告メッセージ
     * @param {number} duration - 表示時間
     */
    showWarning(message, duration = 4000) {
        this.showToast(message, duration, 'warning');
    }

    /**
     * トーストを非表示
     */
    hideToast() {
        if (this.toast) {
            this.toast.classList.remove('show');
        }
    }

    /**
     * スクリーンリーダーへの通知
     * @param {string} message - 通知メッセージ
     */
    announceToScreenReader(message) {
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.style.position = 'absolute';
        announcement.style.left = '-10000px';
        announcement.textContent = message;

        document.body.appendChild(announcement);

        // 少し待ってから削除
        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 1000);
    }

    /**
     * スクロール状態を更新
     */
    updateScrollState() {
        const currentScrollY = window.pageYOffset;
        const statusBar = utils.getElementById('statusBar');
        const newsBanner = utils.getElementById('newsBanner');

        // スクロール方向を検出
        this.scrollDirection = currentScrollY > this.lastScrollY ? 'down' : 'up';
        this.lastScrollY = currentScrollY;

        // ステータスバーの表示制御
        if (statusBar) {
            const shouldShow = true;  //常に表示
            statusBar.classList.toggle('visible', shouldShow);
        }

        // ニュースバナーの表示制御
        if (newsBanner) {
            const shouldShowBanner = currentScrollY < 100; // 100px以上スクロールしたら非表示
            newsBanner.style.display = shouldShowBanner ? 'block' : 'none';
            newsBanner.style.top = '50px'; // 営業状況バーの高さ分下げる
        }

        // スクロール進捗の更新
        this.updateScrollProgress();
    }

    /**
     * スクロール進捗を更新
     */
    updateScrollProgress() {
        const progressFill = document.querySelector('.scroll-progress-fill');
        if (!progressFill) return;

        const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrolled = window.pageYOffset;
        const progress = (scrolled / scrollHeight) * 100;

        progressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }

    /**
     * アクティブナビゲーションを更新
     */
    updateActiveNav() {
        const sections = ['news', 'menu', 'access'];
        const navItems = document.querySelectorAll('.nav-item');

        const currentSection = sections.find(sectionId => {
            const section = utils.getElementById(sectionId);
            if (!section) return false;

            const rect = section.getBoundingClientRect();
            const threshold = window.innerHeight / 2;

            return rect.top <= threshold && rect.bottom >= threshold;
        });

        if (currentSection !== this.activeSection) {
            this.activeSection = currentSection;

            navItems.forEach((item, index) => {
                const isActive = sections[index] === currentSection;
                item.classList.toggle('active', isActive);

                // アクセシビリティ用
                item.setAttribute('aria-current', isActive ? 'page' : 'false');
            });

            // カスタムイベントを発火
            this.emitSectionChange(currentSection);
        }
    }

    /**
     * セクション変更イベントを発火
     * @param {string} sectionId - セクションID
     */
    emitSectionChange(sectionId) {
        const event = new CustomEvent('sectionChange', {
            detail: { sectionId, timestamp: Date.now() }
        });
        document.dispatchEvent(event);
    }

    /**
     * リサイズ処理
     */
    handleResize() {
        // レスポンシブ対応の処理
        this.updateActiveNav();
        this.updateScrollProgress();

        // モバイル表示の調整
        this.adjustMobileLayout();
    }

    /**
     * モバイルレイアウトの調整
     */
    adjustMobileLayout() {
        const isMobile = window.innerWidth < 768;
        document.body.classList.toggle('mobile-layout', isMobile);
    }

    /**
     * スムーズスクロール
     * @param {string} sectionId - セクションID
     * @param {number} offset - オフセット
     */
    smoothScrollTo(sectionId, offset = 60) {
        const target = utils.getElementById(sectionId);
        if (!target) {
            console.warn(`Section "${sectionId}" not found`);
            return;
        }

        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - offset;

        window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
        });

        // フォーカス管理
        this.manageFocusAfterScroll(target);
    }

    /**
     * スクロール後のフォーカス管理
     * @param {Element} target - ターゲット要素
     */
    manageFocusAfterScroll(target) {
        // スクロール完了後にフォーカスを移動
        setTimeout(() => {
            const focusableElement = target.querySelector('h2, h3, [tabindex="0"]') || target;
            if (focusableElement) {
                focusableElement.focus();
            }
        }, 500);
    }

    /**
     * 全てのモーダルを閉じる
     */
    closeAllModals() {
        const modals = document.querySelectorAll('.modal.show, .overlay.show');
        modals.forEach(modal => {
            modal.classList.remove('show');
        });

        this.hideToast();
    }

    /**
     * Tabナビゲーションの処理
     * @param {KeyboardEvent} e - キーボードイベント
     */
    handleTabNavigation(e) {
        const focusableElements = document.querySelectorAll(
            'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
        }
    }

    /**
     * ローディング表示
     * @param {string} containerId - コンテナID
     * @param {string} message - ローディングメッセージ
     */
    showLoading(containerId, message = '読み込み中...') {
        const container = utils.getElementById(containerId);
        if (!container) return;

        const loadingHTML = `
            <div class="loading-overlay" role="status" aria-label="${message}">
                <div class="loading-spinner"></div>
                <p class="loading-message">${message}</p>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', loadingHTML);
    }

    /**
     * ローディング非表示
     * @param {string} containerId - コンテナID
     */
    hideLoading(containerId) {
        const container = utils.getElementById(containerId);
        if (!container) return;

        const loadingOverlay = container.querySelector('.loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.remove();
        }
    }

    /**
     * アニメーション実行
     * @param {Element} element - アニメーション対象要素
     * @param {string} animationClass - アニメーションクラス
     * @param {number} duration - 継続時間
     */
    animate(element, animationClass, duration = CONFIG.ui.animationDuration) {
        if (!element) return Promise.resolve();

        return new Promise((resolve) => {
            element.classList.add(animationClass);

            setTimeout(() => {
                element.classList.remove(animationClass);
                resolve();
            }, duration);
        });
    }

    /**
     * デバッグ情報を表示
     */
    debug() {
        console.group('UIController Debug');
        console.log('Active section:', this.activeSection);
        console.log('Scroll direction:', this.scrollDirection);
        console.log('Last scroll Y:', this.lastScrollY);
        console.log('Toast element:', this.toast);
        console.groupEnd();
    }
}