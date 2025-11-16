const multer = require('multer');
const path = require('path');

/**
 * Multer configuration for file uploads
 */
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max file size
        files: 10 // Max 10 files at once
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
            'application/msword', // doc
            'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
            'application/vnd.ms-powerpoint', // ppt
            'text/plain'
        ];
        
        const allowedExtensions = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt'];
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`File type not supported: ${file.originalname}. Allowed: PDF, DOC, DOCX, PPT, PPTX, TXT`));
        }
    }
});

module.exports = upload;