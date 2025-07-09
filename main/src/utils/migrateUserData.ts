import { db } from '../firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';

/**
 * 既存のユーザーデータをプライベート/パブリック形式に移行する
 * ブラウザコンソールで window.migrateUserData() を実行してください
 */
export async function migrateUserData() {
  console.log('Starting user data migration...');
  
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    let migrated = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const uid = userDoc.id;
      const userData = userDoc.data();
      
      // パブリック情報のみを抽出（メールアドレスを除外）
      const publicProfile = {
        displayName: userData.displayName,
        nickname: userData.nickname,
        photoURL: userData.photoURL,
        lang: userData.lang,
        bubbleColor: userData.bubbleColor,
        textColor: userData.textColor,
        side: userData.side,
        updatedAt: userData.updatedAt || new Date()
      };
      
      // パブリックプロフィールコレクションに保存
      await setDoc(doc(db, 'userProfiles', uid), publicProfile, { merge: true });
      
      migrated++;
      console.log(`Migrated user ${uid} (${migrated}/${usersSnapshot.size})`);
    }
    
    console.log(`Migration completed! Migrated ${migrated} users.`);
    return { success: true, migrated };
  } catch (error) {
    console.error('Migration failed:', error);
    return { success: false, error };
  }
}

// グローバルに公開
(window as any).migrateUserData = migrateUserData;