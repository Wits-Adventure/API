const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

const db = admin.firestore();
const { serverTimestamp } = require('firebase-admin').firestore.FieldValue;

const { authenticate } = require('../functions/auth');


// ** NOTE: The 'authenticate' middleware is defined here to keep this file self-contained. 
// For larger apps, you would put this middleware in its own file (e.g., `/middleware/auth.js`)
// and import it here.

// User Endpoints
router.post('/', authenticate, async (req, res) => {
 try {
     const { userId, email, name, role } = req.body;
        if (req.user.uid !== userId) {
             return res.status(403).json({ error: 'Forbidden: User ID mismatch' });
         }
        const userData = {
            Email: email,
            Name: name,
            joinedAt: serverTimestamp(),
            Role: role,
            LeaderBoardPoints: 0,
            Level: 0,
            CompletedQuests: [],
            Bio: "",
            SpendablePoints: 0,
            Experience: 0,
            Quests: [],
     };
     await db.collection('Users').doc(userId).set(userData);
    res.status(200).json({ message: 'User added successfully' });
    } catch (error) {
    console.error('Error adding user:', error);
    res.status(500).json({ error: 'Failed to add user', details: error.message });
 }
});

router.get('/:userId', authenticate, async (req, res) => {
    try {
        const { userId } = req.params;

        // Authorization check: Ensure the requesting user is the same as the user they are trying to access
        if (req.user.uid !== userId) {
            return res.status(403).json({ error: 'Forbidden: Cannot access other user data' });
        }

        const userDoc = await db.collection('Users').doc(userId).get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User document not found' });
        }

        res.status(200).json(userDoc.data());
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({ error: 'Failed to fetch user data', details: error.message });
    }
});

module.exports = router;