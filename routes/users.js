const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

const db = admin.firestore();
const { serverTimestamp } = require('firebase-admin').firestore.FieldValue;

// Assumes 'auth.js' is located in a directory accessible via '../functions/auth'
const { authenticate } = require('../functions/auth');


// -----------------------------------------------------------
// USER CREATION AND FETCHING
// -----------------------------------------------------------

/**
 * Handles POST requests to create a new user document in Firestore.
 * Requires authentication and ensures the body userId matches the token's UID.
 */
router.post('/', authenticate, async (req, res) => {
    try {
        const { userId, email, name, role } = req.body;
        // Authorization check: Ensure the user is creating their own document
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
            // Note: 'Quests' array is included for compatibility, but 'acceptedQuests' 
            // is typically used for tracking accepted quests as seen in other modules.
            Quests: [], 
        };
        await db.collection('Users').doc(userId).set(userData);
        res.status(200).json({ message: 'User added successfully' });
    } catch (error) {
        console.error('Error adding user:', error);
        res.status(500).json({ error: 'Failed to add user', details: error.message });
    }
});

// -----------------------------------------------------------
// PROFILE ENDPOINTS (Authenticated User)
// -----------------------------------------------------------

/**
 * Handles GET requests to retrieve the profile data for the authenticated user.
 * This route must come before '/:userId' to ensure correct routing.
 */
router.get('/profile', authenticate, async (req, res) => {
    try {
        const userId = req.user.uid; 

        const userDoc = await db.collection('Users').doc(userId).get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User document not found' });
        }

        const userData = userDoc.data();
        // Shape the data for a common profile view
        const profileData = {
            uid: userId,
            Name: userData.Name,
            LeaderBoardPoints: userData.LeaderBoardPoints ?? 0,
            CompletedQuests: userData.CompletedQuests || [],
            acceptedQuests: userData.acceptedQuests || [],
            Level: userData.Level,
            Bio: userData.Bio,
            profilePicture: userData.ProfilePictureUrl, 
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
 * Handles PATCH requests to update the authenticated user's profile data.
 * Ensures a user can only update their own profile.
 */
router.patch('/profile', authenticate, async (req, res) => {
    try {
        // We can trust req.user.uid as the ID of the user performing the request
        const requestingUserId = req.user.uid;
        const { uid, Name, Bio, ProfilePictureUrl } = req.body;

        // Authorization check: Ensure the user is updating their own profile
        if (requestingUserId !== uid) {
            return res.status(403).json({ error: 'Forbidden: Cannot update another user\'s profile' });
        }

        const userDocRef = db.collection('Users').doc(uid);
        
        // Build the update object dynamically
        const updateObj = {};
        if (Name !== undefined) updateObj.Name = Name;
        if (Bio !== undefined) updateObj.Bio = Bio;
        if (ProfilePictureUrl !== undefined) updateObj.ProfilePictureUrl = ProfilePictureUrl;

        if (Object.keys(updateObj).length === 0) {
            return res.status(200).json({ message: 'No fields provided for update' });
        }

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

// -----------------------------------------------------------
// GENERAL USER ENDPOINTS
// -----------------------------------------------------------

/**
 * Handles GET requests to retrieve a user document by ID.
 * Requires authentication and ensures the user is only accessing their own document.
 */
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


// -----------------------------------------------------------
// ADMINISTRATIVE ENDPOINTS
// -----------------------------------------------------------

/**
 * Handles POST requests to iterate over ALL user documents and add/update default fields.
 * This is an administrative function and MUST be protected by an additional role check 
 * in a production application (e.g., check req.user.role === 'admin').
 */
router.post('/init-fields', authenticate, async (req, res) => {
    try {
        // WARNING: Add administrative role check here for security!
        
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
                Quests: [], 
            };
            
            // Use batch.update to merge these fields into existing documents
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

module.exports = router;