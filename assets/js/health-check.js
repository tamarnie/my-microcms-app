// scripts/health-check.js - API健康状態チェックスクリプト

import fetch from 'node-fetch';
import { config } from 'dotenv';

// 環境変数を読み込み
config({ path: '.env.local' });

const API_BASE_URL = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'http://localhost:3000';

/**
 * APIヘルスチェック実行
 */
async function healthCheck() {
    console.log('🔍 API Health Check Starting...\n');
    
    const results = [];
    
    // ニュースAPI チェック
    console.log('📰 Checking News API...');
    const newsResult = await checkNewsAPI();
    results.push(newsResult);
    logResult('News API', newsResult);
    
    // 営業状況API チェック
    console.log('\n🏪 Checking Business Status API...');
    const businessResult = await checkBusinessStatusAPI();
    results.push(businessResult);
    logResult('Business Status API', businessResult);
    
    // 総合結果
    console.log('\n' + '='.repeat(50));
    const allHealthy = results.every(result => result.healthy);
    
    if (allHealthy) {
        console.log('✅ All APIs are healthy');
    } else {
        console.log('❌ Some APIs have issues');
    }
    
    console.log('\n📊 Summary:');
    results.forEach(result => {
        console.log(`  ${result.name}: ${result.healthy ? '✅' : '❌'} ${result.responseTime}ms`);
    });
    
    // 環境変数チェック
    console.log('\n🔧 Environment Variables:');
    checkEnvVars();
    
    process.exit(allHealthy ? 0 : 1);
}

/**
 * ニュースAPIをチェック
 */
async function checkNewsAPI() {
    const startTime = Date.now();
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/news?limit=1`, {
            method: 'GET',
            timeout: 10000
        });
        
        const responseTime = Date.now() - startTime;
        
        if (!response.ok) {
            return {
                name: 'News API',
                healthy: false,
                responseTime,
                error: `HTTP ${response.status}`,
                details: await response.text()
            };
        }
        
        const data = await response.json();
        
        return {
            name: 'News API',
            healthy: true,
            responseTime,
            itemCount: data.contents ? data.contents.length : 0
        };
        
    } catch (error) {
        return {
            name: 'News API',
            healthy: false,
            responseTime: Date.now() - startTime,
            error: error.message
        };
    }
}

/**
 * 営業状況APIをチェック
 */
async function checkBusinessStatusAPI() {
    const startTime = Date.now();
    
    try {
        // GET テスト
        const getResponse = await fetch(`${API_BASE_URL}/api/business-status?limit=1`, {
            method: 'GET',
            timeout: 10000
        });
        
        const responseTime = Date.now() - startTime;
        
        if (!getResponse.ok) {
            return {
                name: 'Business Status API',
                healthy: false,
                responseTime,
                error: `HTTP ${getResponse.status}`,
                details: await getResponse.text()
            };
        }
        
        const data = await getResponse.json();
        
        // POST テスト（テストデータ）
        const testData = {
            status: 'special',
            reason: 'Health check test',
            message: 'This is a test entry',
            priority: 1,
            endTime: new Date(Date.now() + 60000).toISOString() // 1分後に期限切れ
        };
        
        const postResponse = await fetch(`${API_BASE_URL}/api/business-status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testData),
            timeout: 10000
        });
        
        let createdId = null;
        if (postResponse.ok) {
            const postResult = await postResponse.json();
            createdId = postResult.id;
            
            // 作成したテストデータを削除
            if (createdId) {
                await fetch(`${API_BASE_URL}/api/business-status?id=${createdId}`, {
                    method: 'DELETE',
                    timeout: 5000
                }).catch(err => {
                    console.warn(`Failed to cleanup test data: ${err.message}`);
                });
            }
        }
        
        return {
            name: 'Business Status API',
            healthy: true,
            responseTime,
            itemCount: data.contents ? data.contents.length : 0,
            postTest: postResponse.ok ? 'passed' : 'failed'
        };
        
    } catch (error) {
        return {
            name: 'Business Status API',
            healthy: false,
            responseTime: Date.now() - startTime,
            error: error.message
        };
    }
}

/**
 * 結果をログ出力
 */
function logResult(name, result) {
    if (result.healthy) {
        console.log(`  ✅ ${name} is healthy (${result.responseTime}ms)`);
        if (result.itemCount !== undefined) {
            console.log(`     📄 ${result.itemCount} items found`);
        }
        if (result.postTest) {
            console.log(`     📝 POST test: ${result.postTest}`);
        }
    } else {
        console.log(`  ❌ ${name} has issues (${result.responseTime}ms)`);
        console.log(`     Error: ${result.error}`);
        if (result.details) {
            console.log(`     Details: ${result.details.substring(0, 200)}...`);
        }
    }
}

/**
 * 環境変数の確認
 */
function checkEnvVars() {
    const requiredVars = [
        'MICROCMS_API_KEY',
        'MICROCMS_BUSINESS_STATUS_API_KEY',
        'MICROCMS_SERVICE_DOMAIN'
    ];
    
    const optionalVars = [
        'VERCEL_URL',
        'NODE_ENV',
        'DEBUG_MODE'
    ];
    
    console.log('  Required:');
    requiredVars.forEach(varName => {
        const value = process.env[varName];
        if (value) {
            console.log(`    ✅ ${varName}: ${'*'.repeat(Math.min(value.length, 8))}`);
        } else {
            console.log(`    ❌ ${varName}: Not set`);
        }
    });
    
    console.log('  Optional:');
    optionalVars.forEach(varName => {
        const value = process.env[varName];
        if (value) {
            console.log(`    ✅ ${varName}: ${value}`);
        } else {
            console.log(`    ⚪ ${varName}: Not set`);
        }
    });
}

// スクリプト実行
if (import.meta.url === `file://${process.argv[1]}`) {
    healthCheck().catch(error => {
        console.error('Health check failed:', error);
        process.exit(1);
    });
}

export { healthCheck };