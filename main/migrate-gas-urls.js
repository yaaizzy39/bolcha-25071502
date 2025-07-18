#!/usr/bin/env node

/**
 * Migration Script: GAS URLs to Firestore
 * 
 * This script migrates Google Apps Script URLs from environment variables
 * to Firestore admin/publicConfig document.
 * 
 * Usage: node migrate-gas-urls.js
 * 
 * Prerequisites:
 * - Node.js environment with Firebase SDK
 * - .env file with GAS_BASE_URL and GAS_BASE_URL_2
 * - Firebase project configuration
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get current directory (ES module equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
function loadEnvFile() {
  try {
    const envPath = resolve(__dirname, '.env');
    const envContent = readFileSync(envPath, 'utf8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          envVars[key.trim()] = valueParts.join('=').trim();
        }
      }
    });
    
    return envVars;
  } catch (error) {
    console.error('❌ Error loading .env file:', error.message);
    console.error('Make sure .env file exists in the same directory as this script');
    process.exit(1);
  }
}

// Initialize Firebase
function initializeFirebase(env) {
  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
  };

  // Validate required Firebase config
  const requiredFields = ['apiKey', 'authDomain', 'projectId'];
  for (const field of requiredFields) {
    if (!firebaseConfig[field]) {
      console.error(`❌ Missing required Firebase config: VITE_FIREBASE_${field.toUpperCase()}`);
      process.exit(1);
    }
  }

  console.log('🔗 Initializing Firebase...');
  console.log(`   Project ID: ${firebaseConfig.projectId}`);
  
  const app = initializeApp(firebaseConfig);
  return getFirestore(app);
}

// Extract GAS URLs from environment variables
function extractGasUrls(env) {
  const gasUrls = [];
  
  if (env.GAS_BASE_URL) {
    gasUrls.push(env.GAS_BASE_URL);
    console.log('📍 Found GAS_BASE_URL:', env.GAS_BASE_URL);
  }
  
  if (env.GAS_BASE_URL_2) {
    gasUrls.push(env.GAS_BASE_URL_2);
    console.log('📍 Found GAS_BASE_URL_2:', env.GAS_BASE_URL_2);
  }
  
  if (gasUrls.length === 0) {
    console.warn('⚠️  No GAS URLs found in environment variables');
    console.warn('   Looking for: GAS_BASE_URL, GAS_BASE_URL_2');
    return null;
  }
  
  // Remove duplicates
  const uniqueUrls = [...new Set(gasUrls)];
  console.log(`✅ Found ${uniqueUrls.length} unique GAS URL(s)`);
  
  return uniqueUrls;
}

// Main migration function
async function migrateGasUrls() {
  console.log('🚀 Starting GAS URLs migration to Firestore...\n');
  
  try {
    // Load environment variables
    console.log('📄 Loading environment variables...');
    const env = loadEnvFile();
    
    // Initialize Firebase
    const db = initializeFirebase(env);
    
    // Extract GAS URLs
    console.log('\n🔍 Extracting GAS URLs from environment...');
    const gasUrls = extractGasUrls(env);
    
    if (!gasUrls) {
      console.log('⏹️  Migration aborted: No GAS URLs to migrate');
      return;
    }
    
    // Reference to admin/publicConfig document
    const configDocRef = doc(db, 'admin', 'publicConfig');
    
    console.log('\n📊 Checking current Firestore configuration...');
    
    // Check if document exists
    const docSnap = await getDoc(configDocRef);
    const currentData = docSnap.exists() ? docSnap.data() : null;
    
    if (docSnap.exists()) {
      console.log('✅ admin/publicConfig document exists');
      if (currentData.gasEndpoints) {
        console.log('📋 Current gasEndpoints:', currentData.gasEndpoints);
      } else {
        console.log('📋 No gasEndpoints field found in current document');
      }
    } else {
      console.log('📝 admin/publicConfig document does not exist, will create it');
    }
    
    // Prepare the update data
    const updateData = {
      gasEndpoints: gasUrls,
      updatedAt: new Date(),
      migratedFrom: 'environment-variables',
      migrationTimestamp: new Date().toISOString()
    };
    
    console.log('\n💾 Updating Firestore with GAS URLs...');
    console.log('   Document path: admin/publicConfig');
    console.log('   URLs to save:', gasUrls);
    
    // Update the document with merge: true to preserve other fields
    await setDoc(configDocRef, updateData, { merge: true });
    
    console.log('\n✅ Migration completed successfully!');
    console.log('📍 GAS URLs have been saved to Firestore:');
    gasUrls.forEach((url, index) => {
      console.log(`   ${index + 1}. ${url}`);
    });
    
    console.log('\n📝 Next steps:');
    console.log('   1. Verify the data in Firebase Console');
    console.log('   2. Update your application code to read from Firestore');
    console.log('   3. Remove GAS_BASE_URL and GAS_BASE_URL_2 from .env file (after testing)');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    
    if (error.code === 'permission-denied') {
      console.error('   💡 Check Firebase Security Rules for admin collection');
    } else if (error.code === 'unavailable') {
      console.error('   💡 Check your internet connection and Firebase project status');
    } else if (error.message.includes('Firebase App named')) {
      console.error('   💡 Check your Firebase configuration values');
    }
    
    process.exit(1);
  }
}

// Run the migration
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateGasUrls().catch(console.error);
}

export { migrateGasUrls };