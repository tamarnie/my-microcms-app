import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// .envファイルの読み込み（開発環境用）
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fetchBusinessStatus() {
  const apiKey = process.env.MICROCMS_API_KEY || process.env.MICROCMS_BUSINESS_STATUS_API_KEY;
  const domain = process.env.MICROCMS_SERVICE_DOMAIN;
  
  if (!apiKey || !domain) {
    console.warn('⚠️ MicroCMS環境変数が設定されていません');
    return { contents: [] };
  }

  try {
    const response = await fetch(
      `https://${domain}.microcms.io/api/v1/business-status`,
      {
        headers: {
          'X-MICROCMS-API-KEY': apiKey
        }
      }
    );

    if (!response.ok) {
      console.warn(`API応答エラー: ${response.status}`);
      return { contents: [] };
    }

    return await response.json();
  } catch (error) {
    console.error('データ取得エラー:', error.message);
    return { contents: [] };
  }
}

async function main() {
  console.log('📦 営業状況をプリフェッチ中...');
  
  const data = await fetchBusinessStatus();
  
  // public/dataディレクトリの作成
  const dataDir = path.join(__dirname, '../public/data');
  
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (error) {
    // ディレクトリが既に存在する場合は無視
  }
  
  // タイムスタンプとデータを保存
  const output = {
    contents: data.contents || [],
    totalCount: data.totalCount || 0,
    fetchedAt: new Date().toISOString(),
    cached: true
  };
  
  const outputPath = path.join(dataDir, 'business-status-cache.json');
  await fs.writeFile(
    outputPath,
    JSON.stringify(output, null, 2)
  );
  
  console.log(`✅ 営業状況をキャッシュしました: ${outputPath}`);
  console.log(`   - ${output.contents.length}件のデータ`);
  
  if (output.contents.length > 0) {
    const status = output.contents[0];
    console.log(`   - 状態: ${status.status}`);
    console.log(`   - 理由: ${status.reason || 'なし'}`);
  }
}

// エラーハンドリング
main().catch(error => {
  console.error('❌ プリビルドエラー:', error);
  // エラーでもビルドは続行（空のJSONファイルを作成）
  const dataDir = path.join(__dirname, '../public/data');
  const emptyData = {
    contents: [],
    totalCount: 0,
    fetchedAt: new Date().toISOString(),
    cached: true,
    error: true
  };
  
  fs.mkdir(dataDir, { recursive: true })
    .then(() => fs.writeFile(
      path.join(dataDir, 'business-status-cache.json'),
      JSON.stringify(emptyData, null, 2)
    ))
    .then(() => {
      console.log('⚠️ 空のキャッシュファイルを作成しました');
      process.exit(0);
    })
    .catch(() => process.exit(1));
});