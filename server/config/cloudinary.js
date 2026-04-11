/**
 * ============================================
 * CLOUDINARY & MULTER CONFIGURATION
 * ============================================
 * Handles file uploads to Cloudinary cloud storage
 * Uses multer for multipart form data parsing
 * ============================================
 */

const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary with environment variables
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// ============================================
// AVATAR UPLOAD STORAGE
// ============================================
const avatarStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'chatapp/avatars',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        transformation: [{ width: 200, height: 200, crop: 'fill', gravity: 'face' }],
        public_id: (req, file) => `avatar_${req.session.userId}_${Date.now()}`
    }
});

// ============================================
// CHAT FILE UPLOAD STORAGE
// ============================================
const chatFileStorage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
        const isImage = file.mimetype.startsWith('image/');
        const isVideo = file.mimetype.startsWith('video/');

        return {
            folder: 'chatapp/files',
            resource_type: isVideo ? 'video' : 'auto',
            allowed_formats: isImage
                ? ['jpg', 'jpeg', 'png', 'webp', 'gif']
                : isVideo
                    ? ['mp4', 'webm', 'mov']
                    : ['pdf', 'doc', 'docx', 'txt', 'zip', 'rar', 'xlsx', 'pptx', 'csv'],
            public_id: `file_${req.session.userId}_${Date.now()}`
        };
    }
});

// ============================================
// MULTER INSTANCES
// ============================================
const uploadAvatar = multer({
    storage: avatarStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max for avatars
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed for avatars'), false);
        }
    }
});

const uploadChatFile = multer({
    storage: chatFileStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (req, file, cb) => {
        const allowed = [
            'image/jpeg', 'image/png', 'image/webp', 'image/gif',
            'video/mp4', 'video/webm', 'video/quicktime',
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain', 'application/zip', 'application/x-rar-compressed',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/csv'
        ];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('File type not supported'), false);
        }
    }
});

module.exports = { cloudinary, uploadAvatar, uploadChatFile };
