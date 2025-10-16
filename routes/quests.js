const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Import Firestore GeoPoint and FieldValue
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

// -----------------------------------------------------------
// PRIMARY QUEST ENDPOINTS
// -----------------------------------------------------------

/**
 * Handles GET requests to retrieve all quests from Firestore.
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
 * Handles DELETE requests to close a quest, removing it and updating user documents.
 * Requires authentication and ensures the user is the quest creator.
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

// -----------------------------------------------------------
// USER INTERACTION ENDPOINTS
// -----------------------------------------------------------

/**
 * Handles PATCH requests to accept a quest, updating both the quest and user documents.
 * Requires authentication.
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
 * Handles PATCH requests to allow a user to abandon a quest.
 * Requires authentication.
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

// -----------------------------------------------------------
// SUBMISSION & APPROVAL ENDPOINTS
// -----------------------------------------------------------

/**
 * Handles PATCH requests to submit a quest attempt (image URL and user details).
 * Requires authentication.
 */
router.patch('/:questId/submit', authenticate, async (req, res) => {
    try {
        const { questId } = req.params;
        const { imageUrl, userName } = req.body;
        const userId = req.user.uid; // Get userId from the authenticated token

        const questRef = db.collection("Quests").doc(questId);
        
        // Use a transaction to ensure atomic read-modify-write
        await db.runTransaction(async (transaction) => {
            const questDoc = await transaction.get(questRef);
            
            if (!questDoc.exists) {
                throw new Error("Quest not found.");
            }

            let submissions = questDoc.data().submissions || [];

            // 1. Remove previous submission by this user
            submissions = submissions.filter(sub => sub.userId !== userId);

            // 2. Add new submission
            const newSubmission = {
                userId,
                Name: userName,
                imageUrl,
                submittedAt: FieldValue.serverTimestamp() 
            };
            submissions.push(newSubmission);

            // 3. Update quest document with the new submissions array
            transaction.update(questRef, { 
                submissions: submissions 
            });
        });

        res.status(200).json({ 
            message: `Quest attempt submitted successfully for quest ${questId}`
        });
    } catch (error) {
        console.error('Error submitting quest attempt:', error);
        // Check if it's a specific "not found" error from the transaction
        const statusCode = error.message === "Quest not found." ? 404 : 500;
        res.status(statusCode).json({ error: 'Failed to submit quest attempt', details: error.message });
    }
});

/**
 * Handles GET requests to retrieve the submissions for a specific quest by ID.
 * Requires authentication.
 */
router.get('/:questId/submissions', authenticate, async (req, res) => {
    try {
        const { questId } = req.params;

        const questDoc = await db.collection("Quests").doc(questId).get();

        if (!questDoc.exists) {
            return res.status(404).json({ error: 'Quest not found' });
        }

        const questData = questDoc.data();
        const submissions = questData.submissions || [];

        res.status(200).json(submissions);
    } catch (error) {
        console.error('Error fetching quest submissions:', error);
        res.status(500).json({ error: 'Failed to fetch quest submissions', details: error.message });
    }
});

/**
 * Handles PATCH requests to remove a submission from a quest's submissions array by index.
 * Requires authentication and authorization (only creator can remove).
 */
router.patch('/:questId/submissions/remove', authenticate, async (req, res) => {
    try {
        const { questId } = req.params;
        const { submissionIndex } = req.body;
        const userId = req.user.uid; 
        
        // Input validation: Ensure submissionIndex is a non-negative integer
        const index = parseInt(submissionIndex);
        if (isNaN(index) || index < 0) {
            return res.status(400).json({ error: 'Invalid submission index provided' });
        }

        const questRef = db.collection("Quests").doc(questId);

        await db.runTransaction(async (transaction) => {
            const questDoc = await transaction.get(questRef);
            
            if (!questDoc.exists) {
                throw new Error("Quest not found.");
            }

            const questData = questDoc.data();
            let submissions = questData.submissions || [];
            
            // Authorization Check: Ensure only the creator can moderate submissions
            if (questData.creatorId !== userId) {
                // Throw an error that will be caught below to return 403
                throw new Error("Forbidden: Only the quest creator can remove submissions.");
            }
            
            // Boundary Check
            if (index >= submissions.length) {
                // If index is out of bounds, treat it as a successful no-op
                console.log(`Index ${index} out of bounds for quest ${questId}. No update performed.`);
                return;
            }

            // Remove submission by index
            const removedSubmission = submissions.splice(index, 1);

            // Update quest document with the modified array
            transaction.update(questRef, { 
                submissions: submissions 
            });

            console.log(`Submission removed by index ${index}:`, removedSubmission);
        });

        res.status(200).json({ 
            message: `Submission at index ${index} successfully removed from quest ${questId}`
        });
    } catch (error) {
        console.error('Error removing quest submission:', error);
        
        let statusCode = 500;
        if (error.message.startsWith("Quest not found")) statusCode = 404;
        if (error.message.startsWith("Forbidden")) statusCode = 403;

        res.status(statusCode).json({ error: 'Failed to remove quest submission', details: error.message });
    }
});

/**
 * Handles PATCH requests to remove all submissions for a specific userId from a quest.
 * Requires authentication (for authorization).
 * NOTE: For security, only the quest creator or a moderator should be allowed to perform this action.
 */
router.patch('/:questId/submissions/remove-by-user', authenticate, async (req, res) => {
    try {
        const { questId } = req.params;
        const { userIdToRemove } = req.body; // Use a distinct name for clarity
        const requestingUserId = req.user.uid; 

        if (!userIdToRemove) {
            return res.status(400).json({ error: 'Missing userIdToRemove in request body.' });
        }

        const questRef = db.collection("Quests").doc(questId);

        await db.runTransaction(async (transaction) => {
            const questDoc = await transaction.get(questRef);
            
            if (!questDoc.exists) {
                throw new Error("Quest not found.");
            }

            const questData = questDoc.data();
            let submissions = questData.submissions || [];

            // Authorization Check: Ensure only the creator can remove submissions
            if (questData.creatorId !== requestingUserId) {
                throw new Error("Forbidden: Only the quest creator can remove submissions.");
            }
            
            // Filter out submissions matching the target userId
            const originalLength = submissions.length;
            submissions = submissions.filter(sub => sub.userId !== userIdToRemove);
            
            if (submissions.length === originalLength) {
                // If the array size didn't change, no update needed
                console.log(`No submissions found for user ${userIdToRemove} on quest ${questId}. No update performed.`);
                return; 
            }

            // Update quest document with the modified array
            transaction.update(questRef, { 
                submissions: submissions 
            });
        });

        res.status(200).json({ 
            message: `Submissions for user ${userIdToRemove} successfully removed from quest ${questId}`
        });
    } catch (error) {
        console.error('Error removing quest submission by user ID:', error);
        
        let statusCode = 500;
        if (error.message.startsWith("Forbidden")) statusCode = 403;
        if (error.message.includes("not found")) statusCode = 404;

        res.status(statusCode).json({ error: 'Failed to remove quest submission', details: error.message });
    }
});

/**
 * Handles POST requests to approve a submission, award points, and close the quest.
 * Requires authentication and authorization (only quest creator can run this).
 */
router.post('/:questId/approve', authenticate, async (req, res) => {
    try {
        const { questId } = req.params;
        const { approvedUserId } = req.body;
        const requestingUserId = req.user.uid;

        const questRef = db.collection("Quests").doc(questId);
        const approvedUserRef = db.collection("Users").doc(approvedUserId);

        let questReward;
        let creatorId;
        
        // --- STEP 1: TRANSACTION (Read, Update Approved User, Update Creator) ---
        await db.runTransaction(async (transaction) => {
            const [questDoc, approvedUserDoc] = await transaction.getAll(questRef, approvedUserRef);

            // 1. Validation
            if (!questDoc.exists) {
                throw new Error("Quest not found");
            }
            if (!approvedUserDoc.exists) {
                throw new Error("Approved user not found");
            }
            
            const questData = questDoc.data();
            creatorId = questData.creatorId;
            questReward = questData.reward ?? 0;

            // Authorization: Ensure the requesting user is the quest creator
            if (creatorId !== requestingUserId) {
                throw new Error("Forbidden: Only the quest creator can approve submissions");
            }
            
            // The object to push to the CompletedQuests array
            const completedQuestEntry = {
                color: questData.color,
                createdAt: questData.createdAt,
                creatorId: questData.creatorId,
                creatorName: questData.creatorName,
                emoji: questData.emoji,
                imageUrl: questData.imageUrl,
                location: questData.location,
                name: questData.name,
                questId: questId,
                radius: questData.radius,
                reward: questData.reward,
                completedAt: FieldValue.serverTimestamp()
            };

            // 2. Update Approved User (Award points/exp, add to CompletedQuests, remove from acceptedQuests)
            transaction.update(approvedUserRef, {
                SpendablePoints: FieldValue.increment(questReward),
                Experience: FieldValue.increment(questReward),
                LeaderBoardPoints: FieldValue.increment(questReward),
                CompletedQuests: FieldValue.arrayUnion(completedQuestEntry),
                acceptedQuests: FieldValue.arrayRemove(questId) // Clean up
            });

            // 3. Update Quest Creator (Award points/exp for creating, add to CompletedQuests, remove from acceptedQuests)
            if (creatorId) {
                const creatorRef = db.collection("Users").doc(creatorId);
                transaction.update(creatorRef, {
                    SpendablePoints: FieldValue.increment(questReward),
                    Experience: FieldValue.increment(questReward),
                    LeaderBoardPoints: FieldValue.increment(questReward),
                    CompletedQuests: FieldValue.arrayUnion(completedQuestEntry),
                    acceptedQuests: FieldValue.arrayRemove(questId) // Clean up
                });
            }
        });

        // --- STEP 2: BATCH (Clean up other users and delete quest) ---
        // Find all users with this questId in their acceptedQuests to ensure clean removal for everyone
        const usersToCleanSnapshot = await db.collection("Users")
            .where('acceptedQuests', 'array-contains', questId)
            .get();
        
        const batch = db.batch();
        
        // Remove questId from all other users' acceptedQuests arrays
        usersToCleanSnapshot.forEach(userDoc => {
            // FieldValue.arrayRemove is safe to run multiple times, ensuring final cleanup.
            const userRef = db.collection("Users").doc(userDoc.id);
            batch.update(userRef, {
                acceptedQuests: FieldValue.arrayRemove(questId)
            });
        });

        // 5. Delete the quest document as the final step
        batch.delete(questRef); 

        // Commit all batch operations
        await batch.commit();

        res.status(200).json({ 
            message: `Quest ${questId} approved for user ${approvedUserId} and closed successfully.` 
        });

    } catch (error) {
        console.error('Error approving and closing quest:', error);
        
        let statusCode = 500;
        if (error.message.startsWith("Forbidden")) statusCode = 403;
        if (error.message.includes("not found")) statusCode = 404;

        res.status(statusCode).json({ error: 'Failed to approve and close quest', details: error.message });
    }
});

module.exports = router;