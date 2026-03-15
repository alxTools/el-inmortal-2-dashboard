#!/usr/bin/env node

require('dotenv').config();

const { getDriveClient } = require('../src/utils/googleDriveHelper');

function escapeDriveQuery(value) {
    return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
}

async function resolveProjectZipFolder() {
    const drive = getDriveClient();
    if (!drive) {
        throw new Error('Google Drive client not initialized. Check GOOGLE_SERVICE_ACCOUNT_KEY.');
    }

    const parentFolderId = String(process.env.GOOGLE_DRIVE_FOLDER_ID || 'root').trim() || 'root';
    const explicitFolderId = String(process.env.GOOGLE_DRIVE_PROJECT_ZIP_FOLDER_ID || '').trim();
    const folderName = String(process.env.GOOGLE_DRIVE_PROJECT_ZIP_FOLDER_NAME || 'EI2_Project_Data_Zips').trim() || 'EI2_Project_Data_Zips';

    if (explicitFolderId) {
        const existing = await drive.files.get({
            fileId: explicitFolderId,
            fields: 'id,name,mimeType,parents',
            supportsAllDrives: true
        });

        if (existing.data.mimeType !== 'application/vnd.google-apps.folder') {
            throw new Error('GOOGLE_DRIVE_PROJECT_ZIP_FOLDER_ID exists but is not a folder.');
        }

        return {
            mode: 'existing_folder_id',
            folderId: existing.data.id,
            folderName: existing.data.name,
            parentId: (existing.data.parents || [])[0] || null
        };
    }

    const safeFolderName = escapeDriveQuery(folderName);
    const safeParentId = escapeDriveQuery(parentFolderId);

    const listResponse = await drive.files.list({
        q: `mimeType = 'application/vnd.google-apps.folder' and trashed = false and name = '${safeFolderName}' and '${safeParentId}' in parents`,
        fields: 'files(id,name,parents)',
        spaces: 'drive',
        pageSize: 1,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true
    });

    const found = listResponse.data.files && listResponse.data.files[0];
    if (found) {
        return {
            mode: 'found_by_name',
            folderId: found.id,
            folderName: found.name,
            parentId: (found.parents || [])[0] || null
        };
    }

    const createResponse = await drive.files.create({
        resource: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId]
        },
        fields: 'id,name,parents',
        supportsAllDrives: true
    });

    return {
        mode: 'created',
        folderId: createResponse.data.id,
        folderName: createResponse.data.name,
        parentId: (createResponse.data.parents || [])[0] || null
    };
}

async function main() {
    const result = await resolveProjectZipFolder();

    console.log('Google Drive folder ready for Project/Data ZIP uploads.');
    console.log(JSON.stringify(result, null, 2));
    console.log('Set this in your environment for deterministic routing:');
    console.log(`GOOGLE_DRIVE_PROJECT_ZIP_FOLDER_ID=${result.folderId}`);
}

main().catch((error) => {
    console.error('Failed to ensure Project/Data ZIP folder in Google Drive.');
    console.error(error.message);
    process.exit(1);
});
