// js/news-page.js - 新着情報ページ管理

export class NewsPage {
    constructor() {
        this.currentCategory = 'all';
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.newsData = [];
    }

    async init() {
        await this.loadNews();
        this.setupFilters();
        this.render();
    }

    async loadNews() {
        try {
            const response = await fetch('/api/news?limit=100');
            const data = await response.json();
            this.newsData = data.contents || [];
            console.log(`Loaded ${this.newsData.length} news items`);
        } catch (error) {
            console.error('Failed to load news:', error);
            this.showError();
        }
    }

    setupFilters() {
        const filterBtns = document.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // アクティブクラスの切り替え
                filterBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                // カテゴリ変更
                this.currentCategory = e.target.dataset.category;
                this.currentPage = 1;
                this.render();
            });
        });
    }

    getFilteredNews() {
        if (this.currentCategory === 'all') {
            return this.newsData;
        }
        return this.newsData.filter(item => 
            item.category === this.currentCategory
        );
    }

    render() {
        const filteredNews = this.getFilteredNews();
        const totalPages = Math.ceil(filteredNews.length / this.itemsPerPage);
        
        // ページネーション計算
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pageNews = filteredNews.slice(startIndex, endIndex);

        // ニュースリスト表示
        this.renderNewsList(pageNews);
        
        // ページネーション表示
        this.renderPagination(totalPages);
    }

    renderNewsList(newsItems) {
        const container = document.getElementById('newsList');
        
        if (newsItems.length === 0) {
            container.innerHTML = `
                <div class="no-news">
                    <p>現在、表示できる新着情報はありません。</p>
                </div>
            `;
            return;
        }

        container.innerHTML = newsItems.map(item => `
            <article class="news-item">
                <div class="news-date">
                    ${this.formatDate(item.publishedAt || item.createdAt)}
                </div>
                <div class="news-content">
                    <div class="news-header">
                        <span class="news-badge ${item.category || 'news'}">
                            ${this.getCategoryLabel(item.category)}
                        </span>
                        <h2 class="news-title">
                            <a href="/news/${item.id}">
                                ${item.title}
                            </a>
                        </h2>
                    </div>
                    <div class="news-excerpt">
                        ${item.excerpt || item.content?.substring(0, 100) || ''}...
                    </div>
                    ${item.image ? `
                        <div class="news-image">
                            <img src="${item.image.url}?w=400" alt="${item.title}">
                        </div>
                    ` : ''}
                </div>
            </article>
        `).join('');
    }

    renderPagination(totalPages) {
        const container = document.getElementById('pagination');
        
        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        let paginationHTML = '';
        
        // 前へボタン
        if (this.currentPage > 1) {
            paginationHTML += `
                <button class="page-btn" data-page="${this.currentPage - 1}">
                    ← 前へ
                </button>
            `;
        }

        // ページ番号
        for (let i = 1; i <= totalPages; i++) {
            if (
                i === 1 || 
                i === totalPages || 
                (i >= this.currentPage - 2 && i <= this.currentPage + 2)
            ) {
                paginationHTML += `
                    <button class="page-btn ${i === this.currentPage ? 'active' : ''}" 
                            data-page="${i}">
                        ${i}
                    </button>
                `;
            } else if (
                i === this.currentPage - 3 || 
                i === this.currentPage + 3
            ) {
                paginationHTML += '<span class="page-dots">...</span>';
            }
        }

        // 次へボタン
        if (this.currentPage < totalPages) {
            paginationHTML += `
                <button class="page-btn" data-page="${this.currentPage + 1}">
                    次へ →
                </button>
            `;
        }

        container.innerHTML = paginationHTML;

        // イベントリスナー
        container.querySelectorAll('.page-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.currentPage = parseInt(e.target.dataset.page);
                this.render();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return new Intl.DateTimeFormat('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }).format(date);
    }

    getCategoryLabel(category) {
        const labels = {
            news: 'お知らせ',
            event: 'イベント',
            menu: 'メニュー',
            campaign: 'キャンペーン'
        };
        return labels[category] || 'お知らせ';
    }

    showError() {
        const container = document.getElementById('newsList');
        container.innerHTML = `
            <div class="error-message">
                <p>新着情報の読み込みに失敗しました。</p>
                <button onclick="location.reload()">再読み込み</button>
            </div>
        `;
    }
}