// データ移行スクリプト（参考用）
// 本番環境では慎重に実行してください

/*
// Firebase Admin SDK使用例（本番では管理者が実行）
const admin = require('firebase-admin');

async function migrateAdminUsers() {
  try {
    const db = admin.firestore();
    const usersRef = db.collection('users');
    
    // isAdmin: true を持つユーザーを検索
    const adminUsers = await usersRef.where('isAdmin', '==', true).get();
    
    console.log(`Found ${adminUsers.size} admin users to migrate`);
    
    const batch = db.batch();
    
    adminUsers.forEach((doc) => {
      const userData = doc.data();
      console.log(`Migrating user: ${doc.id}, current role: ${userData.role}`);
      
      // role: 'admin' を設定し、isAdmin フィールドを削除
      batch.update(doc.ref, {
        role: 'admin',
        isAdmin: admin.firestore.FieldValue.delete()
      });
    });
    
    await batch.commit();
    console.log('Migration completed successfully');
    
  } catch (error) {
    console.error('Migration error:', error);
  }
}

// 実行前の確認
// migrateAdminUsers();
*/

console.log('データ移行スクリプト（参考用）');
console.log('本番実行前に必ずバックアップを取ってください');
console.log('');
console.log('移行内容:');
console.log('1. isAdmin: true → role: "admin"');
console.log('2. isAdmin フィールドを削除');
console.log('');
console.log('手動での移行方法:');
console.log('1. Firebase Console で users コレクションを開く');
console.log('2. isAdmin: true のユーザーを探す');
console.log('3. role: "admin" を追加');
console.log('4. isAdmin フィールドを削除');