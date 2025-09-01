const express = require('express');
const router = express.Router();
const multer = require('multer');
const admin = require('firebase-admin');

/**
 * Middleware to authenticate requests using Firebase ID tokens.
 * It expects a 'Bearer' token in the 'Authorization' header.
 * If the token is valid, it decodes it and attaches the user information to `req.user`.
 * Otherwise, it returns a 401 Unauthorized error.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 * @param {function} next - The next middleware function.
 * @returns {void}
 */
const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }

    const idToken = authHeader.split(' ')[1];

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Error verifying ID token:', error);
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

// The helper function remains the same
const uploadImageToStorage = async (fileBuffer, fileName, userId) => {
    const bucket = admin.storage().bucket();
    const filePath = `quests/${userId}/${Date.now()}_${fileName}`;
    const file = bucket.file(filePath);

    try {
        await file.save(fileBuffer, {
            contentType: 'image/jpeg',
            public: true
        });

        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
        return publicUrl;
    } catch (error) {
        console.error("Error uploading file to Firebase Storage:", error);
        throw new Error("Failed to upload file to Cloud Storage.");
    }
};

const uploadMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    },
});

// Update the router.post path to '/image'
router.post('/image', authenticate, uploadMiddleware.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file uploaded.' });
        }

        const userId = req.user.uid; 
        if (!userId) {
             return res.status(400).json({ error: 'User ID is missing from the authentication token.' });
        }

        const imageUrl = await uploadImageToStorage(req.file.buffer, req.file.originalname, userId);

        res.status(200).json({ 
            message: 'Image uploaded successfully!', 
            imageUrl: imageUrl, 
        });

    } catch (error) {
        console.error('Failed to upload image:', error);
        res.status(500).json({ error: error.message });
    }
});

// Export the router so it can be used in other files
module.exports = router;
