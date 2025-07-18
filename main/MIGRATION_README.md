# GAS URLs Migration Script

This directory contains a migration script to move Google Apps Script (GAS) URLs from environment variables to Firestore.

## Overview

The migration script (`migrate-gas-urls.js`) reads the current GAS URLs from your `.env` file and stores them in the Firestore `admin/publicConfig` document under the `gasEndpoints` array field.

## Prerequisites

1. **Node.js** - Make sure you have Node.js installed
2. **Firebase Project** - Your Firebase project must be properly configured
3. **Environment Variables** - Your `.env` file must contain Firebase configuration and GAS URLs

## Required Environment Variables

The script requires these variables in your `.env` file:

### Firebase Configuration
```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

### GAS URLs (to be migrated)
```
GAS_BASE_URL=https://script.google.com/macros/s/.../exec
GAS_BASE_URL_2=https://script.google.com/macros/s/.../exec
```

## How to Run the Migration

### Option 1: Using npm script (Recommended)
```bash
npm run migrate:gas-urls
```

### Option 2: Direct node execution
```bash
node migrate-gas-urls.js
```

## What the Script Does

1. **Reads Environment Variables** - Loads all variables from the `.env` file
2. **Validates Firebase Config** - Ensures all required Firebase settings are present
3. **Extracts GAS URLs** - Finds `GAS_BASE_URL` and `GAS_BASE_URL_2` from environment
4. **Connects to Firestore** - Initializes Firebase connection using your project settings
5. **Updates Firestore Document** - Creates or updates `admin/publicConfig` with:
   - `gasEndpoints`: Array of GAS URLs
   - `updatedAt`: Migration timestamp
   - `migratedFrom`: Source indicator
   - `migrationTimestamp`: ISO timestamp

## Expected Output

### Successful Migration
```
🚀 Starting GAS URLs migration to Firestore...

📄 Loading environment variables...
🔗 Initializing Firebase...
   Project ID: your-project-id

🔍 Extracting GAS URLs from environment...
📍 Found GAS_BASE_URL: https://script.google.com/macros/s/.../exec
📍 Found GAS_BASE_URL_2: https://script.google.com/macros/s/.../exec
✅ Found 2 unique GAS URL(s)

📊 Checking current Firestore configuration...
✅ admin/publicConfig document exists
📋 Current gasEndpoints: [...]

💾 Updating Firestore with GAS URLs...
   Document path: admin/publicConfig
   URLs to save: [...]

✅ Migration completed successfully!
📍 GAS URLs have been saved to Firestore:
   1. https://script.google.com/macros/s/.../exec
   2. https://script.google.com/macros/s/.../exec

📝 Next steps:
   1. Verify the data in Firebase Console
   2. Update your application code to read from Firestore
   3. Remove GAS_BASE_URL and GAS_BASE_URL_2 from .env file (after testing)
```

## Firestore Document Structure

After migration, the `admin/publicConfig` document will contain:

```json
{
  "gasEndpoints": [
    "https://script.google.com/macros/s/.../exec",
    "https://script.google.com/macros/s/.../exec"
  ],
  "updatedAt": "2025-07-18T10:30:00.000Z",
  "migratedFrom": "environment-variables",
  "migrationTimestamp": "2025-07-18T10:30:00.000Z"
}
```

## Error Handling

The script includes comprehensive error handling for common issues:

- **Missing .env file** - Clear error message with resolution steps
- **Invalid Firebase config** - Validation of required configuration fields
- **Permission denied** - Guidance on Firebase Security Rules
- **Network issues** - Suggestions for connectivity problems
- **No GAS URLs found** - Warning when environment variables are missing

## Troubleshooting

### Permission Denied Error
If you get a `permission-denied` error, check your Firestore Security Rules for the `admin` collection.

### Firebase Configuration Error
Ensure all `VITE_FIREBASE_*` variables are properly set in your `.env` file.

### No GAS URLs Found
The script looks for `GAS_BASE_URL` and `GAS_BASE_URL_2`. Make sure at least one is defined.

## After Migration

1. **Verify in Firebase Console** - Check that the data was saved correctly
2. **Update Application Code** - Modify your app to read GAS URLs from Firestore instead of environment variables
3. **Test Thoroughly** - Ensure the application works with the new configuration
4. **Clean Up** - Remove the old environment variables from `.env` file

## Security Note

This script uses merge mode (`{ merge: true }`) when updating the Firestore document, which means it will preserve any existing fields in the `admin/publicConfig` document and only update the GAS-related fields.