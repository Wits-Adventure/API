// app.js
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Firebase setup
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

// Import routes
const userRoutes = require('./routes/users');
const uploadRoutes = require('./routes/upload');
const questsRoutes = require('./routes/quests');
const profileRoutes = require('./routes/profile');
app.use('/api/profile', profileRoutes);
app.use('/api/users', userRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/quests', questsRoutes);

module.exports = { app, db, authAdmin };
