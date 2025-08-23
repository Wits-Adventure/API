const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString()
);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DB_URL,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET, // Add your storage bucket URL here

});

const db = admin.firestore();
const authAdmin = admin.auth();
const storageAdmin = admin.storage(); // Get the Storage service from Admin SDK


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
        // Verify the Firebase ID token
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        // Attach the decoded token (containing user information like UID) to the request object
        req.user = decodedToken;
        next(); // Proceed to the next middleware or route handler
    } catch (error) {
        console.error('Error verifying ID token:', error);
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

app.get('/test-quests', async (req, res) => {
    try {
        const snapshot = await db.collection('Quests').get();
        const quests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(quests);
    } catch (error) {
        console.error('Error fetching Quests:', error);
        res.status(500).json({ error: 'Failed to fetch Quests' });
    }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Backend is running on port ${PORT}`);
});