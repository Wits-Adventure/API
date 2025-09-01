const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK
// This is where we will now add the storageBucket option
const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString()
);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DB_URL,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
});

const db = admin.firestore();
const authAdmin = admin.auth();

const userRoutes = require('./routes/users');
const upload = require('./routes/upload')
const questsRoutes = require('./routes/quests');

app.use('/api/users', userRoutes);
app.use('/api/upload', upload) 
app.use('/api/quests', questsRoutes);

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Backend is running on port ${PORT}`);
});
