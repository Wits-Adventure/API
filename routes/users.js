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


/**
 * Handles GET requests to retrieve the profile data for the authenticated user.
 * Requires authentication. The user ID is retrieved from the token.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>}
 */
router.get('/profile', authenticate, async (req, res) => {
    try {
        // The user ID is guaranteed to be present and valid by the 'authenticate' middleware
        const userId = req.user.uid; 

        const userDoc = await db.collection('Users').doc(userId).get();

        if (!userDoc.exists) {
            // This case should ideally not happen if a user is authenticated, 
            // but handles the scenario where a document was deleted.
            return res.status(404).json({ error: 'User document not found' });
        }

        // We can shape the data here to match what the frontend expects
        const userData = userDoc.data();
        const profileData = {
            uid: userId,
            Name: userData.Name,
            LeaderBoardPoints: userData.LeaderBoardPoints ?? 0,
            CompletedQuests: userData.CompletedQuests || [],
            acceptedQuests: userData.acceptedQuests || [],
            Level: userData.Level,
            Bio: userData.Bio,
            profilePicture: userData.ProfilePictureUrl, // Assumes a field name
            Experience: userData.Experience ?? 0,
            SpendablePoints: userData.SpendablePoints ?? 0,
        };

        res.status(200).json(profileData);
    } catch (error) {
        console.error('Error fetching user profile data:', error);
        res.status(500).json({ error: 'Failed to fetch profile data', details: error.message });
    }
});


/**
 * Handles POST requests to iterate over ALL user documents and add/update default fields.
 * This is an administrative function and should only be run by an authorized user/process.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>}
 */
router.post('/init-fields', authenticate, async (req, res) => {
    try {
        // NOTE: A real-world application MUST include a role/permission check here, 
        // e.g., if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
        
        console.log(`Starting batch update of default fields requested by user ${req.user.uid}`);

        const usersCollectionRef = db.collection("Users");
        const querySnapshot = await usersCollectionRef.get();

        if (querySnapshot.empty) {
            console.log("No documents found in the users collection. Batch job finished.");
            return res.status(200).json({ message: 'No users found to update.' });
        }

        const batch = db.batch();
        let updateCount = 0;

        // Iterate over all documents and prepare the batch update
        querySnapshot.forEach(document => {
            const userDocRef = db.collection("Users").doc(document.id);
            
            // The object to be merged into the user document
            const updates = {
                Level: 0,
                CompletedQuests: [],
                Bio: "",
                SpendablePoints: 0,
                Experience: 0,
                // The 'Quests' array seems redundant if 'acceptedQuests' is used,
                // but we include it to match the frontend function's logic.
                Quests: [], 
            };
            
            // Use batch.set with merge:true, or batch.update
            batch.update(userDocRef, updates);
            updateCount++;
        });

        // Commit the batch of updates
        await batch.commit();

        console.log(`Successfully updated ${updateCount} user documents with default fields.`);
        res.status(200).json({ 
            message: `Successfully processed and updated ${updateCount} user documents.` 
        });

    } catch (error) {
        console.error("Error running user profile field initialization batch job:", error);
        res.status(500).json({ error: 'Failed to run batch update job', details: error.message });
    }
});


/**
 * Handles PATCH requests to update the authenticated user's profile data.
 * Requires authentication and ensures a user can only update their own profile.
 * @param {object} req - The Express request object, containing update fields in the body.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>}
 */
router.patch('/profile', authenticate, async (req, res) => {
    try {
        // The user ID to update is provided in the body (or could be derived from token for extra security)
        const { uid, Name, Bio, ProfilePictureUrl } = req.body;
        const requestingUserId = req.user.uid;

        // Authorization check: Ensure the user is updating their own profile
        if (requestingUserId !== uid) {
            return res.status(403).json({ error: 'Forbidden: Cannot update another user\'s profile' });
        }

        const userDocRef = db.collection('Users').doc(uid);
        
        // Build the update object dynamically based on provided fields
        const updateObj = {};
        if (Name !== undefined) updateObj.Name = Name;
        if (Bio !== undefined) updateObj.Bio = Bio;
        if (ProfilePictureUrl !== undefined) updateObj.ProfilePictureUrl = ProfilePictureUrl;

        // Ensure there is something to update
        if (Object.keys(updateObj).length === 0) {
            return res.status(200).json({ message: 'No fields provided for update' });
        }

        // Perform the update
        await userDocRef.update(updateObj);

        res.status(200).json({ 
            message: 'Profile updated successfully',
            updatedFields: Object.keys(updateObj)
        });

    } catch (error) {
        console.error('Error updating profile data:', error);
        res.status(500).json({ error: 'Failed to update profile data', details: error.message });
    }
});

module.exports = router;