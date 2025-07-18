#!/usr/bin/env node

/**
 * Test Script: Validate Migration Setup
 * 
 * This script validates that all prerequisites for the GAS URLs migration
 * are met without actually performing the migration.
 * 
 * Usage: node test-migration-setup.js
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get current directory
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
    return null;
  }
}

function validateSetup() {
  console.log('🧪 Testing migration setup...\n');
  
  // Check .env file
  console.log('1. Checking .env file...');
  const env = loadEnvFile();
  if (!env) {
    console.log('   ❌ Failed to load .env file');
    return false;
  }
  console.log('   ✅ .env file loaded successfully');
  
  // Check Firebase configuration
  console.log('\n2. Checking Firebase configuration...');
  const requiredFirebaseVars = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID'
  ];
  
  let firebaseValid = true;
  for (const varName of requiredFirebaseVars) {
    if (!env[varName]) {
      console.log(`   ❌ Missing: ${varName}`);
      firebaseValid = false;
    } else {
      console.log(`   ✅ Found: ${varName}`);
    }
  }
  
  if (!firebaseValid) {
    console.log('   ❌ Firebase configuration incomplete');
    return false;
  }
  
  // Check GAS URLs
  console.log('\n3. Checking GAS URLs...');
  const gasUrls = [];
  
  if (env.GAS_BASE_URL) {
    gasUrls.push(env.GAS_BASE_URL);
    console.log(`   ✅ Found GAS_BASE_URL: ${env.GAS_BASE_URL}`);
  } else {
    console.log('   ⚠️  GAS_BASE_URL not found');
  }
  
  if (env.GAS_BASE_URL_2) {
    gasUrls.push(env.GAS_BASE_URL_2);
    console.log(`   ✅ Found GAS_BASE_URL_2: ${env.GAS_BASE_URL_2}`);
  } else {
    console.log('   ⚠️  GAS_BASE_URL_2 not found');
  }
  
  if (gasUrls.length === 0) {
    console.log('   ❌ No GAS URLs found for migration');
    return false;
  }
  
  console.log(`   ✅ Found ${gasUrls.length} GAS URL(s) ready for migration`);
  
  // Summary
  console.log('\n📋 Setup Validation Summary:');
  console.log('   ✅ Environment file: OK');
  console.log('   ✅ Firebase config: OK');
  console.log(`   ✅ GAS URLs: ${gasUrls.length} found`);
  console.log('\n🚀 Ready to run migration! Use: npm run migrate:gas-urls');
  
  return true;
}

// Run the validation
async function main() {
  try {
    const isValid = validateSetup();
    process.exit(isValid ? 0 : 1);
  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

// Check if this file is being run directly
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                    import.meta.url.endsWith(process.argv[1]);

if (isMainModule) {
  main();
}