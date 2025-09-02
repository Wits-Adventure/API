// routes/profile.js

const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

const db = admin.firestore();

// GET endpoint to fetch a user's profile data
router.get('/', async (req, res) => {
    try {
        const { uid } = req.query;
        if (!uid) {
            return res.status(400).json({ error: "User ID is required." });
        }
        
        const userDocRef = db.collection("Users").doc(uid);
        const userDoc = await userDocRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: "User document not found." });
        }

        const userData = userDoc.data();
        const profileData = {
            uid: userDoc.id,
            Name: userData.Name,
            LeaderBoardPoints: userData.LeaderBoardPoints,
            CompletedQuests: userData.CompletedQuests ? userData.CompletedQuests.length : 0,
            Level: userData.Level,
            Bio: userData.Bio,
            profilePicture: userData.ProfilePictureUrl,
        };

        res.status(200).json(profileData);
    } catch (error) {
        console.error("Error fetching profile data:", error);
        res.status(500).json({ error: "Failed to fetch profile data." });
    }
});

// POST endpoint to update a user's profile
router.post('/update', async (req, res) => {
    try {
        const { uid, Name, Bio, ProfilePictureUrl } = req.body;
        if (!uid) {
            return res.status(400).json({ error: "User ID is required." });
        }
        
        const userDocRef = db.collection("Users").doc(uid);
        const updateObj = {};
        if (Name !== undefined) updateObj.Name = Name;
        if (Bio !== undefined) updateObj.Bio = Bio;
        if (ProfilePictureUrl !== undefined) updateObj.ProfilePictureUrl = ProfilePictureUrl;

        await userDocRef.update(updateObj);
        res.status(200).json({ message: "Profile updated successfully." });
    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({ error: "Failed to update profile." });
    }
});

// POST endpoint to add profile fields to all users
// WARNING: This is a potentially long-running and sensitive operation.
// It should be secured with an authentication token and run only by an admin.
router.post('/add-fields', async (req, res) => {
    try {
        const usersCollectionRef = db.collection("Users");
        const querySnapshot = await usersCollectionRef.get();

        if (querySnapshot.empty) {
            console.log("No documents found in the users collection.");
            return res.status(200).json({ message: "No users to update." });
        }
        
        const batch = db.batch();
        querySnapshot.docs.forEach(doc => {
            const userDocRef = db.collection("Users").doc(doc.id);
            batch.update(userDocRef, {
                Level: 0,
                CompletedQuests: [],
                Bio: "",
                SpendablePoints: 0,
                Experience: 0,
                Quests: [],
            });
        });

        await batch.commit();
        res.status(200).json({ message: "All user profiles updated successfully." });
    } catch (error) {
        console.error("Error adding profile fields:", error);
        res.status(500).json({ error: "Failed to add profile fields." });
    }
});

module.exports = router;