const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Document Storage Service
 * Manages persistence of uploaded files for stateful processing.
 * Currently uses local file system. Can be adapted for S3/Redis.
 */
class DocumentStorage {
    constructor(storageDir = 'uploads/storage') {
        this.storageDir = path.resolve(storageDir);
        this.init();
    }

    async init() {
        try {
            await fs.mkdir(this.storageDir, { recursive: true });
        } catch (err) {
            console.error('Failed to initialize storage directory:', err);
        }
    }

    /**
     * Save a file to storage
     * @param {Object} file - Multer file object
     * @returns {Promise<string>} - The document ID (UUID)
     */
    async save(file) {
        const docId = crypto.randomUUID();
        const docDir = path.join(this.storageDir, docId);
        
        await fs.mkdir(docDir, { recursive: true });
        
        const targetPath = path.join(docDir, file.originalname);
        
        // Move file from temp (multer) to storage
        // If file.path is in a different temporary dir (like /tmp), we might need to copy/unlink
        // But usually simple rename works if on same partition. 
        // fallback to copyFile+unlink if rename fails.
        try {
            await fs.rename(file.path, targetPath);
        } catch (e) {
            await fs.copyFile(file.path, targetPath);
            await fs.unlink(file.path).catch(() => {});
        }

        // Store metadata
        const metadata = {
            id: docId,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            path: targetPath,
            uploadDate: new Date().toISOString()
        };
        
        await fs.writeFile(path.join(docDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
        
        return docId;
    }

    /**
     * Get file info by ID
     * @param {string} docId 
     * @returns {Promise<Object>} - Metadata object including path
     */
    async get(docId) {
        const docDir = path.join(this.storageDir, docId);
        const metadataPath = path.join(docDir, 'metadata.json');
        
        try {
            const data = await fs.readFile(metadataPath, 'utf8');
            const metadata = JSON.parse(data);
            
            // Verify file still exists
            await fs.access(metadata.path);
            
            return metadata;
        } catch (err) {
            throw new Error(`Document ${docId} not found or corrupted`);
        }
    }

    /**
     * Clean up a document
     * @param {string} docId 
     */
    async cleanup(docId) {
        const docDir = path.join(this.storageDir, docId);
        try {
            await fs.rm(docDir, { recursive: true, force: true });
        } catch (err) {
            // Ignore if already gone
        }
    }
}

module.exports = new DocumentStorage();
