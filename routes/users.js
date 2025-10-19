const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

const db = admin.firestore();
// IMPORTANT: Include FieldValue for transactions in new code section
const { serverTimestamp, FieldValue } = require('firebase-admin').firestore.FieldValue; 

// Assumes 'auth.js' is located in a directory accessible via '../functions/auth'
const { authenticate } = require('../functions/auth');


// -----------------------------------------------------------
// 1. USER CREATION
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
// 2. PROFILE ENDPOINTS (Authenticated User)
// ** MUST BE BEFORE /:userId **
// -----------------------------------------------------------

/**
 * Handles GET requests to retrieve the profile data for the authenticated user.
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
        const requestingUserId = req.user.uid;
        // Note: uid is passed from frontend updateProfileData for server-side authorization check
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
// 3. GENERAL USER ENDPOINTS
// -----------------------------------------------------------

/**
 * Handles GET requests to retrieve a user document by ID.
 * Requires authentication and ensures the user is only accessing their own document.
 */
router.get('/:userId', authenticate, async (req, res) => {
    try {
        const { userId } = req.params;

        // Authorization check: Ensures the requesting user is the same as the user they are trying to access
        // This handler will only run if the path is NOT '/profile'
        if (req.user.uid !== userId) {
            // This can be modified to allow public viewing if security rules permit.
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
// 4. ADMINISTRATIVE ENDPOINTS
// -----------------------------------------------------------

/**
 * Handles POST requests to iterate over ALL user documents and add/update default fields.
 * This is an administrative function and MUST be protected by an additional role check 
 * in a production application (e.g., check req.user.role === 'admin').
 */
router.post('/init-fields', authenticate, async (req, res) => {
    try {
        // WARNING: Add administrative role check here for security!
        
        // Example Admin Check (uncomment for production):
        // if (req.user.role !== 'admin') {
        //     return res.status(403).json({ error: 'Forbidden: Admin role required' });
        // }
        
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

// -----------------------------------------------------------
// 5. INVENTORY & CUSTOMISATION ENDPOINTS (NEWLY ADDED)
// -----------------------------------------------------------

/**
 * Handles GET requests to retrieve the authenticated user's inventory items.
 */
router.get('/inventory', authenticate, async (req, res) => {
    try {
        const userId = req.user.uid;
        const userDocRef = db.collection('Users').doc(userId);
        const userDoc = await userDocRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User document not found' });
        }

        let userData = userDoc.data();
        // Return the inventoryItems object, or an empty object if not present
        let inventory = userData.inventoryItems || {}; 

        res.status(200).json(inventory);
    } catch (error) {
        console.error('Error fetching user inventory:', error);
        res.status(500).json({ error: 'Failed to fetch inventory data', details: error.message });
    }
});

/**
 * Handles POST requests to unlock an inventory item using spendable points.
 * Uses a Firestore Transaction for atomic point debit and item unlock.
 */
router.post('/inventory/unlock', authenticate, async (req, res) => {
    const { itemId, cost } = req.body;
    const userId = req.user.uid;

    if (!itemId || cost === undefined) {
        return res.status(400).json({ error: 'Missing itemId or cost in request body' });
    }

    try {
        const userDocRef = db.collection('Users').doc(userId);

        // Run the update within a transaction to ensure atomicity
        await db.runTransaction(async (t) => {
            const docSnapshot = await t.get(userDocRef);

            if (!docSnapshot.exists) {
                throw new Error("User document does not exist in Firestore");
            }

            const userData = docSnapshot.data();
            const inventory = userData.inventoryItems || {};
            const spendablePoints = userData.SpendablePoints ?? 0;

            if (inventory[itemId]) {
                // Item already unlocked is often treated as success, but can be a client error if cost was sent.
                throw new Error("Item already unlocked");
            }
            if (spendablePoints < cost) {
                throw new Error("Not enough points to unlock item");
            }

            // Update the data
            inventory[itemId] = true;
            const newSpendablePoints = spendablePoints - cost;

            // Commit the update
            t.update(userDocRef, {
                inventoryItems: inventory,
                SpendablePoints: newSpendablePoints
            });
        });

        res.status(200).json({ message: 'Item unlocked successfully' });
    } catch (error) {
        console.error('Error unlocking item:', error);
        // Specifically check for business logic errors
        const status = error.message.includes("Not enough points") || error.message.includes("Item already unlocked") ? 400 : 500;
        res.status(status).json({ error: 'Failed to unlock item', details: error.message });
    }
});

/**
 * Handles PATCH requests to update the user's customisation preferences.
 */
router.patch('/customisation', authenticate, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { borderId, cardColor, backgroundColor } = req.body;
        const userDocRef = db.collection('Users').doc(userId);

        // Build the update object dynamically for nested fields
        const updateObj = {};
        if (borderId !== undefined) updateObj["customisation.borderId"] = borderId;
        if (cardColor !== undefined) updateObj["customisation.cardColor"] = cardColor;
        if (backgroundColor !== undefined) updateObj["customisation.backgroundColor"] = backgroundColor;
        
        if (Object.keys(updateObj).length === 0) {
            return res.status(200).json({ message: 'No customisation fields provided for update' });
        }

        await userDocRef.update(updateObj);

        res.status(200).json({ 
            message: 'Customisation updated successfully',
            updatedFields: Object.keys(updateObj)
        });

    } catch (error) {
        console.error('Error updating customisation data:', error);
        res.status(500).json({ error: 'Failed to update customisation', details: error.message });
    }
});

/**
 * Handles GET requests to retrieve the authenticated user's customisation data.
 */
router.get('/customisation', authenticate, async (req, res) => {
    try {
        const userId = req.user.uid;
        const userDoc = await db.collection('Users').doc(userId).get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User document not found' });
        }

        const customisationData = userDoc.data().customisation || {};

        res.status(200).json(customisationData);
    } catch (error) {
        console.error('Error fetching customisation data:', error);
        res.status(500).json({ error: 'Failed to fetch customisation data', details: error.message });
    }
});

// File: users.js (Additions)

// ... (existing imports and routes)

/**
 * Handles GET requests to retrieve the authenticated user's inventory and customisation data.
 * Also ensures the inventoryItems field is initialized if missing.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>}
 */
router.get('/inventory', authenticate, async (req, res) => {
    try {
        const userId = req.user.uid; 
        const userDocRef = db.collection('Users').doc(userId);
        let inventory = {};
        let customisation = {};
        
        const ALL_INVENTORY_ITEMS = [
            'card-customization',
            'background-customization',
            'border-1',
            'border-2',
            'border-3',
            'border-4',
            'border-5',
            'border-6'
        ];

        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userDocRef);

            if (!userDoc.exists) {
                throw new Error("User document does not exist in Firestore");
            }
            
            let userData = userDoc.data();
            inventory = userData.inventoryItems || {};
            customisation = userData.customisation || {};

            // Initialize inventoryItems if missing (Transactional update)
            if (Object.keys(inventory).length === 0 || !userData.inventoryItems) {
                ALL_INVENTORY_ITEMS.forEach(itemId => {
                    inventory[itemId] = false; // false means locked
                });
                transaction.update(userDocRef, { inventoryItems: inventory });
            }
        });

        res.status(200).json({ 
            inventoryItems: inventory,
            customisation: customisation
        });

    } catch (error) {
        console.error('Error fetching inventory/customisation data:', error);
        res.status(500).json({ error: 'Failed to fetch inventory/customisation data', details: error.message });
    }
});
module.exports = router;