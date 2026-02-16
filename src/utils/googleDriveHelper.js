const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Google Drive Configuration
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// Initialize Google Drive API
function getDriveClient() {
    // Check for service account credentials
    let credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    
    if (!credentials) {
        console.error('❌ GOOGLE_SERVICE_ACCOUNT_KEY not found in environment variables');
        return null;
    }

    try {
        // Handle both single-line and multi-line JSON
        // Replace escaped newlines with actual newlines in private_key
        credentials = credentials.replace(/\\n/g, '\n');
        
        // Parse the service account key
        const keys = JSON.parse(credentials);
        
        console.log('[GoogleDrive] Initializing with service account:', keys.client_email);
        
        // Ensure private key has proper format
        let privateKey = keys.private_key;
        if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
            console.error('❌ Invalid private key format');
            return null;
        }
        
        const auth = new google.auth.JWT(
            keys.client_email,
            null,
            privateKey,
            SCOPES,
            null,  // subject - not needed for service account
            keys.private_key_id  // key id for better tracking
        );

        const drive = google.drive({ version: 'v3', auth });
        console.log('[GoogleDrive] Client initialized successfully');
        return drive;
    } catch (err) {
        console.error('❌ Error initializing Google Drive:', err.message);
        console.error('Stack:', err.stack);
        return null;
    }
}

/**
 * Upload a file to Google Drive
 * @param {string} localFilePath - Path to local file
 * @param {string} fileName - Name to give the file in Drive
 * @param {string} mimeType - MIME type of the file
 * @returns {Promise<string>} - Google Drive file ID
 */
async function uploadToDrive(localFilePath, fileName, mimeType = 'audio/wav') {
    const drive = getDriveClient();
    if (!drive) {
        throw new Error('Google Drive client not initialized');
    }

    try {
        console.log(`📤 Uploading to Google Drive: ${fileName}`);

        const fileMetadata = {
            name: fileName,
            parents: [process.env.GOOGLE_DRIVE_FOLDER_ID || 'root'] // Optional: specific folder
        };

        const media = {
            mimeType: mimeType,
            body: fs.createReadStream(localFilePath)
        };

        const response = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink, webContentLink'
        });

        const fileId = response.data.id;
        console.log(`✅ Uploaded to Google Drive: ${fileId}`);

        // Make the file publicly readable (optional - for direct download)
        await drive.permissions.create({
            fileId: fileId,
            resource: {
                role: 'reader',
                type: 'anyone'
            }
        });

        // Return the direct download link
        const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        return {
            fileId: fileId,
            downloadUrl: downloadUrl,
            viewUrl: response.data.webViewLink
        };
    } catch (error) {
        console.error('❌ Error uploading to Google Drive:', error);
        throw error;
    }
}

/**
 * Download a file from Google Drive
 * @param {string} fileIdOrUrl - Google Drive file ID or URL
 * @returns {Promise<string>} - Path to downloaded temporary file
 */
async function downloadFromDrive(fileIdOrUrl) {
    const drive = getDriveClient();
    if (!drive) {
        throw new Error('Google Drive client not initialized');
    }

    try {
        // Extract file ID from URL if needed
        let fileId = fileIdOrUrl;
        if (fileIdOrUrl.includes('drive.google.com')) {
            const match = fileIdOrUrl.match(/id=([^&]+)/) || fileIdOrUrl.match(/\/d\/([^/]+)/);
            if (match) fileId = match[1];
        }

        console.log(`📥 Downloading from Google Drive: ${fileId}`);

        // Get file metadata
        const fileMetadata = await drive.files.get({
            fileId: fileId,
            fields: 'name, mimeType, size'
        });

        const fileName = fileMetadata.data.name;
        const tempPath = path.join(os.tmpdir(), `gdrive_${Date.now()}_${fileName}`);

        // Download file
        const dest = fs.createWriteStream(tempPath);
        const response = await drive.files.get(
            { fileId: fileId, alt: 'media' },
            { responseType: 'stream' }
        );

        await new Promise((resolve, reject) => {
            response.data
                .on('end', () => {
                    console.log(`✅ Downloaded: ${tempPath}`);
                    resolve();
                })
                .on('error', reject)
                .pipe(dest);
        });

        return tempPath;
    } catch (error) {
        console.error('❌ Error downloading from Google Drive:', error);
        throw error;
    }
}

/**
 * Check if a path/URL is a Google Drive reference
 * @param {string} filePath 
 * @returns {boolean}
 */
function isGoogleDrivePath(filePath) {
    return filePath && (
        filePath.includes('drive.google.com') ||
        filePath.includes('googleapis.com') ||
        filePath.startsWith('gdrive://')
    );
}

/**
 * Clean up temporary file
 * @param {string} tempPath 
 */
function cleanupTempFile(tempPath) {
    try {
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
            console.log(`🗑️ Cleaned up: ${tempPath}`);
        }
    } catch (error) {
        console.error('Error cleaning up temp file:', error);
    }
}

module.exports = {
    uploadToDrive,
    downloadFromDrive,
    isGoogleDrivePath,
    cleanupTempFile,
    getDriveClient
};
