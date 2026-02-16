const { Dropbox } = require('dropbox');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Initialize Dropbox client
const getDropboxClient = () => {
    const accessToken = process.env.DROPBOX_ACCESS_TOKEN;
    if (!accessToken) {
        console.error('❌ DROPBOX_ACCESS_TOKEN not found in environment variables');
        return null;
    }
    return new Dropbox({ accessToken });
};

/**
 * Download a file from Dropbox to a temporary location
 * @param {string} dropboxPath - Path in Dropbox (e.g., "/GALANTE_CONTENT/El Inmortal 2/ALBUM MASTERED/file.wav")
 * @returns {Promise<string>} - Path to the downloaded temporary file
 */
async function downloadFromDropbox(dropboxPath) {
    const dbx = getDropboxClient();
    if (!dbx) {
        throw new Error('Dropbox client not initialized. Check DROPBOX_ACCESS_TOKEN.');
    }

    try {
        console.log(`📥 Downloading from Dropbox: ${dropboxPath}`);
        
        // Download file from Dropbox
        const response = await dbx.filesDownload({ path: dropboxPath });
        
        if (!response.result || !response.result.fileBinary) {
            throw new Error('No file data received from Dropbox');
        }

        // Create temporary file
        const tempDir = os.tmpdir();
        const fileName = path.basename(dropboxPath);
        const tempPath = path.join(tempDir, `dropbox_${Date.now()}_${fileName}`);
        
        // Write file to disk
        fs.writeFileSync(tempPath, response.result.fileBinary);
        
        const stats = fs.statSync(tempPath);
        console.log(`✅ Downloaded to: ${tempPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        
        return tempPath;
    } catch (error) {
        console.error('❌ Dropbox download error:', error);
        throw new Error(`Failed to download from Dropbox: ${error.message}`);
    }
}

/**
 * Clean up temporary file
 * @param {string} tempPath - Path to temporary file
 */
function cleanupTempFile(tempPath) {
    try {
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
            console.log(`🗑️ Cleaned up temp file: ${tempPath}`);
        }
    } catch (error) {
        console.error('Error cleaning up temp file:', error);
    }
}

/**
 * Check if a path is a Dropbox path
 * @param {string} filePath 
 * @returns {boolean}
 */
function isDropboxPath(filePath) {
    return filePath && (
        filePath.includes('Dropbox') || 
        filePath.startsWith('/GALANTE_CONTENT') ||
        filePath.includes('GALANTE_CONTENT')
    );
}

/**
 * Convert local Dropbox path to Dropbox API path
 * @param {string} localPath 
 * @returns {string}
 */
function convertToDropboxPath(localPath) {
    // Extract the part after "Dropbox"
    const dropboxMatch = localPath.match(/Dropbox\/(.*)/);
    if (dropboxMatch) {
        return `/${dropboxMatch[1].replace(/\\/g, '/')}`;
    }
    
    // If it's already a Dropbox-style path
    if (localPath.includes('GALANTE_CONTENT')) {
        const match = localPath.match(/GALANTE_CONTENT.*$/);
        if (match) {
            return `/${match[0].replace(/\\/g, '/')}`;
        }
    }
    
    return localPath.replace(/\\/g, '/');
}

module.exports = {
    downloadFromDropbox,
    cleanupTempFile,
    isDropboxPath,
    convertToDropboxPath,
    getDropboxClient
};
