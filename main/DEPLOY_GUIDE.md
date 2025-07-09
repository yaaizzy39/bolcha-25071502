# Bolcha デプロイガイド

## 前提条件
- Node.js 18以上がインストールされている
- Firebase CLIがインストールされている (`npm install -g firebase-tools`)
- Firebaseプロジェクトが作成済み

## Step 1: 依存関係のインストール

```bash
# プロジェクトディレクトリに移動
cd bolcha

# 依存関係をクリーンインストール
rm -rf node_modules package-lock.json
npm install
```

## Step 2: プロジェクトのビルド

```bash
# TypeScriptコンパイルとViteビルドを実行
npm run build
```

ビルドが成功すると `dist` フォルダが作成されます。

## Step 3: Firebase認証とプロジェクト設定

```bash
# Firebaseにログイン
firebase login

# プロジェクト一覧確認
firebase projects:list

# プロジェクトを初期化（初回のみ）
firebase init

# 既存プロジェクトを使用する場合
firebase use [your-project-id]
```

## Step 4: デプロイ実行

```bash
# Hostingのみデプロイ
firebase deploy --only hosting

# 全てデプロイ（Firestore、Functions含む）
firebase deploy
```

## 設定ファイル

### firebase.json
```json
{
  "functions": {
    "source": "functions"
  },
  "firestore": {
    "rules": "../firestore.rules"
  },
  "hosting": {
    "public": "dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

## トラブルシューティング

### ビルドエラーが発生する場合
```bash
# キャッシュをクリア
npm run clean
rm -rf dist
npm run build
```

### 依存関係エラーの場合
```bash
# 強制再インストール
rm -rf node_modules package-lock.json
npm install --force
```

### WSL環境での問題
- Windows側のNode.jsを使用することを推奨
- PowerShellまたはコマンドプロンプトからビルド・デプロイを実行

## デプロイ後の確認事項

1. アプリケーションが正常に表示される
2. ログイン機能が動作する
3. ルーム作成・削除が動作する
4. メッセージ送受信が動作する
5. 管理者画面でルーム数制限設定が動作する
6. ルーム数制限が正常に機能する

## Firebase Console での設定

1. Authentication の設定確認
2. Firestore Database の設定確認
3. Hosting の独自ドメイン設定（必要に応じて）
4. Security Rules の確認

## 環境変数の設定

本プロジェクトはFirebase設定が `src/firebase.ts` にハードコードされているため、
本番環境では環境変数を使用することを推奨：

```typescript
// 本番環境用の設定例
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  // その他の設定...
};
```