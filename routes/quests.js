const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Import Firestore GeoPoint and FieldValue for server-side operations
const { GeoPoint, FieldValue } = require('firebase-admin/firestore');

/**
 * Middleware to authenticate requests using Firebase ID tokens.
 * It expects a 'Bearer' token in the 'Authorization' header.
 * If the token is valid, it decodes it and attaches the user information to `req.user`.
 * Otherwise, it returns a 401 Unauthorized error.
 * NOTE: This function is required in this file for the routes to function.
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

// Apply authentication middleware to all quests routes
router.use(authenticate);

// =========================================================================
// GENERAL QUEST ROUTES
// =========================================================================

/**
 * GET /api/quests
 * Fetches all quests.
 */
router.get('/', async (req, res) => {
    try {
        // Simple fetch, assuming "Quests" collection contains general quests
        const questsSnapshot = await db.collection('Quests').get();
        const quests = questsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(quests);
    } catch (error) {
        console.error('Error fetching quests:', error);
        res.status(500).json({ error: 'Failed to fetch quests' });
    }
});

/**
 * POST /api/quests
 * Creates a new quest.
 * Body: { name, description, points, ... (must not include creatorId/acceptedQuests/submissions) }
 */
router.post('/', async (req, res) => {
    try {
        const questData = {
            ...req.body,
            creatorId: req.user.uid, // Creator ID is inferred securely from the token
            createdAt: FieldValue.serverTimestamp(),
            acceptedQuests: [],
            submissions: [],
            isArchived: false,
        };

        // Handle GeoPoint conversion for location-based quests
        if (questData.location && typeof questData.location.latitude === 'number' && typeof questData.location.longitude === 'number') {
            questData.location = new GeoPoint(questData.location.latitude, questData.location.longitude);
        } else {
            delete questData.location; // Remove if invalid/missing
        }

        const newQuestRef = await db.collection('Quests').add(questData);
        res.status(201).json({ message: 'Quest created successfully', questId: newQuestRef.id });

    } catch (error) {
        console.error('Error creating quest:', error);
        res.status(500).json({ error: 'Failed to create quest' });
    }
});

/**
 * PATCH /api/quests/:questId/accept
 * Adds the quest ID to the user's acceptedQuests array.
 */
router.patch('/:questId/accept', async (req, res) => {
    const userId = req.user.uid;
    const { questId } = req.params;
    const userRef = db.collection('Users').doc(userId);

    try {
        await userRef.update({
            acceptedQuests: FieldValue.arrayUnion(questId)
        });
        res.status(200).json({ message: `Quest ${questId} accepted.` });
    } catch (error) {
        console.error(`Error accepting quest ${questId} for user ${userId}:`, error);
        res.status(500).json({ error: 'Failed to accept quest' });
    }
});

/**
 * PATCH /api/quests/:questId/abandon
 * Removes the quest ID from the user's acceptedQuests array.
 */
router.patch('/:questId/abandon', async (req, res) => {
    const userId = req.user.uid;
    const { questId } = req.params;
    const userRef = db.collection('Users').doc(userId);

    try {
        await userRef.update({
            acceptedQuests: FieldValue.arrayRemove(questId)
        });
        res.status(200).json({ message: `Quest ${questId} abandoned.` });
    } catch (error) {
        console.error(`Error abandoning quest ${questId} for user ${userId}:`, error);
        res.status(500).json({ error: 'Failed to abandon quest' });
    }
});

/**
 * PATCH /api/quests/:questId/submit
 * Submits a quest attempt (adds submission to the quest document).
 * Body: { imageUrl, userName }
 */
router.patch('/:questId/submit', async (req, res) => {
    const userId = req.user.uid;
    const { questId } = req.params;
    const { imageUrl, userName } = req.body;
    const questRef = db.collection('Quests').doc(questId);

    if (!imageUrl || !userName) {
        return res.status(400).json({ error: 'Missing imageUrl or userName in submission body.' });
    }

    try {
        const newSubmission = {
            userId: userId, // Securely from token
            userName: userName,
            imageUrl: imageUrl,
            submittedAt: FieldValue.serverTimestamp(),
            status: 'pending' // Default status
        };

        await questRef.update({
            submissions: FieldValue.arrayUnion(newSubmission)
        });

        res.status(200).json({ message: 'Submission received.' });
    } catch (error) {
        console.error(`Error submitting attempt for quest ${questId}:`, error);
        res.status(500).json({ error: 'Failed to submit quest attempt' });
    }
});


/**
 * GET /api/quests/:questId/submissions
 * Fetches all submissions for a quest.
 */
router.get('/:questId/submissions', async (req, res) => {
    const { questId } = req.params;
    const questRef = db.collection('Quests').doc(questId);

    try {
        const questDoc = await questRef.get();
        if (!questDoc.exists) {
            return res.status(404).json({ error: 'Quest not found.' });
        }

        const submissions = questDoc.data().submissions || [];
        // Only allow creators to see submissions (or a dedicated admin role)
        if (questDoc.data().creatorId !== req.user.uid) {
            return res.status(403).json({ error: 'Forbidden: You are not the quest creator.' });
        }
        
        res.status(200).json(submissions);
    } catch (error) {
        console.error(`Error fetching submissions for quest ${questId}:`, error);
        res.status(500).json({ error: 'Failed to fetch submissions' });
    }
});

/**
 * PATCH /api/quests/:questId/submissions/remove
 * Removes a submission by index.
 * Body: { submissionIndex }
 */
router.patch('/:questId/submissions/remove', async (req, res) => {
    const { questId } = req.params;
    const { submissionIndex } = req.body;
    const questRef = db.collection('Quests').doc(questId);

    if (typeof submissionIndex !== 'number' || submissionIndex < 0) {
        return res.status(400).json({ error: 'Invalid submissionIndex.' });
    }

    try {
        const doc = await db.runTransaction(async (t) => {
            const questDoc = await t.get(questRef);
            if (!questDoc.exists) throw new Error("Quest not found.");
            if (questDoc.data().creatorId !== req.user.uid) throw new Error("Forbidden: Not the creator.");
            
            const submissions = questDoc.data().submissions || [];
            if (submissionIndex >= submissions.length) throw new Error("Invalid submission index.");

            // Create a new array excluding the submission at the index
            const updatedSubmissions = submissions.filter((_, index) => index !== submissionIndex);
            
            t.update(questRef, { submissions: updatedSubmissions });
            return { message: 'Submission removed.' };
        });

        res.status(200).json(doc);
    } catch (error) {
        console.error(`Error removing submission by index for quest ${questId}:`, error);
        const status = error.message.includes("Forbidden") ? 403 : 500;
        res.status(status).json({ error: error.message || 'Failed to remove submission.' });
    }
});

/**
 * PATCH /api/quests/:questId/submissions/remove-by-user
 * Removes all submissions from a specific user.
 * Body: { userIdToRemove }
 */
router.patch('/:questId/submissions/remove-by-user', async (req, res) => {
    const { questId } = req.params;
    const { userIdToRemove } = req.body;
    const questRef = db.collection('Quests').doc(questId);

    if (!userIdToRemove) {
        return res.status(400).json({ error: 'Missing userIdToRemove.' });
    }

    try {
        const doc = await db.runTransaction(async (t) => {
            const questDoc = await t.get(questRef);
            if (!questDoc.exists) throw new Error("Quest not found.");
            if (questDoc.data().creatorId !== req.user.uid) throw new Error("Forbidden: Not the creator.");
            
            const submissions = questDoc.data().submissions || [];
            // Filter out all submissions belonging to userIdToRemove
            const updatedSubmissions = submissions.filter(sub => sub.userId !== userIdToRemove);
            
            t.update(questRef, { submissions: updatedSubmissions });
            return { message: `Submissions for user ${userIdToRemove} removed.` };
        });

        res.status(200).json(doc);
    } catch (error) {
        console.error(`Error removing submission by user for quest ${questId}:`, error);
        const status = error.message.includes("Forbidden") ? 403 : 500;
        res.status(status).json({ error: error.message || 'Failed to remove submissions by user.' });
    }
});

/**
 * DELETE /api/quests/:questId
 * Closes (deletes) a quest and cleans up accepted lists for all users.
 */
router.delete('/:questId', async (req, res) => {
    const { questId } = req.params;
    const questRef = db.collection('Quests').doc(questId);

    try {
        await db.runTransaction(async (t) => {
            const questDoc = await t.get(questRef);
            if (!questDoc.exists) throw new Error("Quest not found.");
            if (questDoc.data().creatorId !== req.user.uid) throw new Error("Forbidden: Not the creator.");

            // 1. Find all users who accepted this quest
            const usersToCleanSnapshot = await db.collection("Users")
                .where('acceptedQuests', 'array-contains', questId)
                .get();

            // 2. Remove questId from all other users' acceptedQuests arrays using batch
            const batch = db.batch();
            usersToCleanSnapshot.forEach(userDoc => {
                const userRef = db.collection("Users").doc(userDoc.id);
                batch.update(userRef, {
                    acceptedQuests: FieldValue.arrayRemove(questId)
                });
            });
            await batch.commit(); // Commit the batch outside of the transaction, or manage the t object better.

            // 3. Delete the quest document as the final step (using the transaction to ensure atomicity for the delete)
            t.delete(questRef);
        });

        res.status(200).json({ message: `Quest ${questId} closed and removed from all users.` });

    } catch (error) {
        console.error('Error closing quest:', error);
        const status = error.message.includes("Forbidden") ? 403 : 500;
        res.status(status).json({ error: error.message || 'Failed to close quest.' });
    }
});


/**
 * POST /api/quests/:questId/approve
 * Approves a submission, awards points to the user and creator, and closes the quest.
 * Body: { approvedUserId }
 */
router.post('/:questId/approve', async (req, res) => {
    const { questId } = req.params;
    const { approvedUserId } = req.body;
    const questRef = db.collection('Quests').doc(questId);

    if (!approvedUserId) {
        return res.status(400).json({ error: 'Missing approvedUserId.' });
    }

    try {
        await db.runTransaction(async (t) => {
            const questDoc = await t.get(questRef);
            if (!questDoc.exists) throw new Error("Quest not found.");

            const questData = questDoc.data();
            const creatorId = questData.creatorId;
            const rewardPoints = questData.points || 0; // Ensure points exist

            // Creator check
            if (creatorId !== req.user.uid) {
                throw new Error("Forbidden: Only the quest creator can approve submissions.");
            }

            const approvedUserRef = db.collection('Users').doc(approvedUserId);
            const approvedUserDoc = await t.get(approvedUserRef);

            // 1. Award points and update completed lists for the approved user
            if (approvedUserDoc.exists) {
                t.update(approvedUserRef, {
                    SpendablePoints: FieldValue.increment(rewardPoints),
                    LeaderBoardPoints: FieldValue.increment(rewardPoints),
                    // Remove from accepted list
                    acceptedQuests: FieldValue.arrayRemove(questId) 
                    // Add to completed list (assuming a CompletedQuests array structure)
                });
            }

            // 2. Award points and update completed lists for the creator (optional)
            if (creatorId !== approvedUserId) {
                const creatorRef = db.collection('Users').doc(creatorId);
                // Simple point reward for creator contribution
                t.update(creatorRef, { 
                    SpendablePoints: FieldValue.increment(rewardPoints / 2) 
                });
            }

            // 3. Clean up and delete quest (Similar to DELETE /:questId logic)
            // Note: Batch operations are usually preferred outside transactions, but here we perform the user cleanup first
            const usersToCleanSnapshot = await db.collection("Users")
                .where('acceptedQuests', 'array-contains', questId)
                .get();
            
            const batch = db.batch();
            usersToCleanSnapshot.forEach(userDoc => {
                const userRef = db.collection("Users").doc(userDoc.id);
                batch.update(userRef, {
                    acceptedQuests: FieldValue.arrayRemove(questId)
                });
            });
            await batch.commit(); 

            // 4. Delete the quest document
            t.delete(questRef); 
        });

        res.status(200).json({ 
            message: `Quest ${questId} approved for user ${approvedUserId} and closed successfully.` 
        });

    } catch (error) {
        console.error('Error approving and closing quest:', error);
        
        let statusCode = 500;
        if (error.message.includes("Forbidden")) statusCode = 403;
        if (error.message.includes("not found")) statusCode = 404;

        res.status(statusCode).json({ error: error.message || 'Failed to approve and close quest.' });
    }
});


// =========================================================================
// JOURNEY QUEST ROUTES
// =========================================================================

/**
 * GET /api/quests/journey/progress
 * Fetches the current user's journey quest progress.
 */
router.get('/journey/progress', async (req, res) => {
    const userId = req.user.uid;
    const userRef = db.collection('Users').doc(userId);

    try {
        const userDoc = await userRef.get();

        const progress = {
            currentJourneyQuest: null,
            currentJourneyStop: 1,
            completedJourneyQuests: [],
        };

        if (userDoc.exists) {
            const userData = userDoc.data();
            progress.currentJourneyQuest = userData.currentJourneyQuest || null;
            progress.currentJourneyStop = userData.currentJourneyStop || 1;
            progress.completedJourneyQuests = userData.completedJourneyQuests || [];
        } else {
            // Initialize user document if it doesn't exist
            await userRef.set(progress, { merge: true });
        }

        res.status(200).json(progress);
    } catch (error) {
        console.error(`Error fetching journey progress for user ${userId}:`, error);
        res.status(500).json({ error: 'Failed to fetch journey quest progress' });
    }
});

/**
 * PATCH /api/quests/journey/accept
 * Accepts a new journey quest (and implicitly abandons any current one).
 * Body: { journeyQuestId }
 */
router.patch('/journey/accept', async (req, res) => {
    const userId = req.user.uid;
    const { journeyQuestId } = req.body;
    const userRef = db.collection('Users').doc(userId);

    if (!journeyQuestId) {
        return res.status(400).json({ error: 'Missing journeyQuestId' });
    }

    try {
        await userRef.set({
            currentJourneyQuest: journeyQuestId,
            currentJourneyStop: 1 // Always start at stop 1
        }, { merge: true });

        res.status(200).json({ message: `Journey quest ${journeyQuestId} accepted.` });
    } catch (error) {
        console.error(`Error accepting journey quest ${journeyQuestId} for user ${userId}:`, error);
        res.status(500).json({ error: 'Failed to accept journey quest' });
    }
});

/**
 * PATCH /api/quests/journey/advance
 * Advances the current journey quest stop number.
 * Body: { journeyQuestId, newStop }
 */
router.patch('/journey/advance', async (req, res) => {
    const userId = req.user.uid;
    const { journeyQuestId, newStop } = req.body;
    const userRef = db.collection('Users').doc(userId);

    if (!journeyQuestId || typeof newStop !== 'number' || newStop < 1) {
        return res.status(400).json({ error: 'Missing or invalid journeyQuestId or newStop' });
    }

    try {
        const userDoc = await userRef.get();
        // Simple security check: ensure the user is on the quest they are trying to advance
        if (userDoc.data()?.currentJourneyQuest !== journeyQuestId) {
             return res.status(403).json({ error: 'User is not currently undertaking this journey quest.' });
        }

        await userRef.update({
            currentJourneyStop: newStop
        });

        res.status(200).json({ message: `Journey quest stop advanced to ${newStop}.` });
    } catch (error) {
        console.error(`Error advancing journey quest for user ${userId}:`, error);
        res.status(500).json({ error: 'Failed to advance journey quest stop' });
    }
});

/**
 * PATCH /api/quests/journey/abandon
 * Resets the current journey quest fields, effectively abandoning it.
 */
router.patch('/journey/abandon', async (req, res) => {
    const userId = req.user.uid;
    const userRef = db.collection('Users').doc(userId);

    try {
        // Resetting both fields removes the current quest and puts the user back at stop 1.
        await userRef.update({
            currentJourneyQuest: null,
            currentJourneyStop: 1
        });

        res.status(200).json({ message: 'Journey quest successfully abandoned and progress reset.' });
    } catch (error) {
        console.error(`Error abandoning journey quest for user ${userId}:`, error);
        res.status(500).json({ error: 'Failed to abandon journey quest' });
    }
});

/**
 * POST /api/quests/journey/complete
 * Completes the current journey quest, awards points, and resets progress.
 * Body: { journeyQuestId, rewardPoints }
 */
router.post('/journey/complete', async (req, res) => {
    const userId = req.user.uid;
    const { journeyQuestId, rewardPoints } = req.body;
    const userRef = db.collection('Users').doc(userId);

    if (!journeyQuestId || typeof rewardPoints !== 'number' || rewardPoints < 0) {
        return res.status(400).json({ error: 'Missing or invalid journeyQuestId or rewardPoints' });
    }

    try {
        // Use a transaction for atomic update of points and completion status
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);

            if (!userDoc.exists) {
                throw new Error("User document not found.");
            }

            const userData = userDoc.data();
            const completedQuests = userData.completedJourneyQuests || [];

            // Add the quest ID to the completed list if it's not already there
            if (!completedQuests.includes(journeyQuestId)) {
                completedQuests.push(journeyQuestId);
            }

            // Award points and reset journey progress fields
            transaction.update(userRef, {
                currentJourneyQuest: null, // Reset current quest
                currentJourneyStop: 1, // Reset stop
                completedJourneyQuests: completedQuests,
                // Award points using FieldValue.increment
                SpendablePoints: FieldValue.increment(rewardPoints),
                LeaderBoardPoints: FieldValue.increment(rewardPoints)
            });
        });

        res.status(200).json({ message: `Journey quest ${journeyQuestId} completed successfully. ${rewardPoints} points awarded.` });
    } catch (error) {
        console.error(`Error completing journey quest ${journeyQuestId} for user ${userId}:`, error);
        res.status(500).json({ error: 'Failed to complete journey quest' });
    }
});


module.exports = router;
