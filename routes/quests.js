const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Import Firestore GeoPoint and FieldValue here
const { GeoPoint, FieldValue } = require('firebase-admin/firestore');

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

const db = admin.firestore();

/**
 * Handles GET requests to retrieve all quests from Firestore.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>}
 */
router.get('/', async (req, res) => {
    try {
        const questsRef = db.collection("Quests");
        const querySnapshot = await questsRef.get();
        const questsArray = [];
        querySnapshot.forEach(doc => {
            questsArray.push({ id: doc.id, ...doc.data() });
        });
        res.status(200).json(questsArray);
    } catch (error) {
        console.error('Error fetching quests:', error);
        res.status(500).json({ error: 'Failed to fetch quests', details: error.message });
    }
});

/**
 * Handles POST requests to create a new quest in Firestore.
 * Requires authentication.
 * @param {object} req - The Express request object, containing quest data in the body.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>}
 */
router.post('/', authenticate, async (req, res) => {
    try {
        const { name, radius, reward, type, lat, lng, imageUrl, emoji, color, creatorName } = req.body;
        const creatorId = req.user.uid;

        const questData = {
            name,
            radius: Number(radius),
            reward: Number(reward),
            type,
            location: new GeoPoint(Number(lat), Number(lng)),
            imageUrl,
            creatorId,
            creatorName,
            createdAt: FieldValue.serverTimestamp(),
            active: true,
            acceptedBy: [],
            emoji,
            color
        };

        const questRef = await db.collection("Quests").add(questData);
        res.status(201).json({ 
            message: `Quest "${name}" added successfully!`,
            questId: questRef.id
        });
    } catch (error) {
        console.error("Error adding quest:", error);
        res.status(500).json({ error: 'Failed to add quest', details: error.message });
    }
});

/**
 * Handles PATCH requests to accept a quest, updating both the quest and user documents.
 * Requires authentication.
 * @param {object} req - The Express request object, with the quest ID in URL params.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>}
 */
router.patch('/:questId/accept', authenticate, async (req, res) => {
    try {
        const { questId } = req.params;
        const userId = req.user.uid;

        const questRef = db.collection("Quests").doc(questId);
        const userRef = db.collection("Users").doc(userId);

        // Use a transaction to ensure both updates succeed or fail together
        await db.runTransaction(async (transaction) => {
            const [questDoc, userDoc] = await transaction.getAll(questRef, userRef);
            
            // Check if quest and user documents exist
            if (!questDoc.exists) {
                throw new Error("Quest not found");
            }
            if (!userDoc.exists) {
                throw new Error("User not found");
            }

            // Update quest's acceptedBy array
            transaction.update(questRef, {
                acceptedBy: FieldValue.arrayUnion(userId)
            });
            
            // Update user's acceptedQuests array
            transaction.update(userRef, {
                acceptedQuests: FieldValue.arrayUnion(questId)
            });
        });
        res.status(200).json({ message: 'Quest accepted successfully' });
    } catch (error) {
        console.error('Error accepting quest:', error);
        res.status(500).json({ error: 'Failed to accept quest', details: error.message });
    }
});

/**
 * Handles DELETE requests to close a quest, removing it and updating user documents.
 * Requires authentication and ensures the user is the quest creator.
 * @param {object} req - The Express request object, with quest ID in URL params.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>}
 */
router.delete('/:questId', authenticate, async (req, res) => {
    try {
        const { questId } = req.params;
        const userId = req.user.uid;

        const questRef = db.collection("Quests").doc(questId);

        // Use a transaction for atomicity
        await db.runTransaction(async (transaction) => {
            const questDoc = await transaction.get(questRef);

            if (!questDoc.exists) {
                return res.status(404).json({ error: 'Quest not found' });
            }

            // Authorization: Ensure the authenticated user is the quest creator
            const questData = questDoc.data();
            if (questData.creatorId !== userId) {
                return res.status(403).json({ error: 'Forbidden: You are not the creator of this quest' });
            }

            // Efficiently remove questId from only the relevant users
            const acceptedBy = questData.acceptedBy || [];
            const userUpdatePromises = acceptedBy.map(acceptedByUserId => {
                const userRef = db.collection("Users").doc(acceptedByUserId);
                return transaction.update(userRef, {
                    acceptedQuests: FieldValue.arrayRemove(questId)
                });
            });
            await Promise.all(userUpdatePromises);

            // Delete the quest document
            transaction.delete(questRef);
        });

        res.status(200).json({ message: 'Quest and associated user data removed successfully' });

    } catch (error) {
        console.error('Error closing quest:', error);
        res.status(500).json({ error: 'Failed to close quest', details: error.message });
    }
});

/**
 * Handles PATCH requests to allow a user to abandon a quest.
 * Requires authentication.
 * @param {object} req - The Express request object, with the quest ID in URL params.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>}
 */
router.patch('/:questId/abandon', authenticate, async (req, res) => {
    try {
        const { questId } = req.params;
        const userId = req.user.uid; // Get userId from the authenticated token

        const questRef = db.collection("Quests").doc(questId);
        const userRef = db.collection("Users").doc(userId);

        // Use a transaction to ensure both updates succeed or fail together
        await db.runTransaction(async (transaction) => {
            const [questDoc, userDoc] = await transaction.getAll(questRef, userRef);
            
            if (!questDoc.exists || !userDoc.exists) {
                throw new Error("Quest or user not found.");
            }

            // Update quest's acceptedBy array
            transaction.update(questRef, {
                acceptedBy: FieldValue.arrayRemove(userId)
            });
            
            // Update user's acceptedQuests array
            transaction.update(userRef, {
                acceptedQuests: FieldValue.arrayRemove(questId)
            });
        });
        res.status(200).json({ message: 'Quest abandoned successfully' });
    } catch (error) {
        console.error('Error abandoning quest:', error);
        res.status(500).json({ error: 'Failed to abandon quest', details: error.message });
    }
});
module.exports = router;
