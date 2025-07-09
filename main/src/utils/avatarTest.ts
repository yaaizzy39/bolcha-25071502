// Utility function to test avatar loading
export const testAvatarLoading = async (url: string): Promise<{ success: boolean; error?: string }> => {
  if (!url) {
    return { success: false, error: 'No URL provided' };
  }

  try {
    // Test if URL is reachable
    const response = await fetch(url, { method: 'HEAD' });
    
    if (response.ok) {
      return { success: true };
    } else {
      return { 
        success: false, 
        error: `HTTP ${response.status}: ${response.statusText}` 
      };
    }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};

// Test function to be used in browser console
export const debugAvatarIssues = async (userId: string) => {
  console.log('=== Avatar Debug Report ===');
  
  // Check localStorage
  const localPrefs = localStorage.getItem('chat_prefs');
  console.log('1. localStorage chat_prefs:', localPrefs ? JSON.parse(localPrefs) : 'None');
  
  // Check if Firebase is initialized
  try {
    const { getAuth } = await import('firebase/auth');
    const { getFirestore, doc, getDoc } = await import('firebase/firestore');
    
    const auth = getAuth();
    const db = getFirestore();
    
    console.log('2. Firebase Auth current user:', auth.currentUser?.photoURL);
    
    // Check Firestore user document
    const userDoc = await getDoc(doc(db, 'users', userId));
    console.log('3. Firestore user document exists:', userDoc.exists());
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      console.log('4. Firestore user data:', userData);
      
      if (userData.photoURL) {
        console.log('5. Testing avatar URL...');
        const testResult = await testAvatarLoading(userData.photoURL);
        console.log('6. Avatar URL test result:', testResult);
      }
    }
    
  } catch (error) {
    console.error('Error during debug:', error);
  }
  
  console.log('=== End Debug Report ===');
};

// Make it available globally for debugging
(window as any).debugAvatarIssues = debugAvatarIssues;