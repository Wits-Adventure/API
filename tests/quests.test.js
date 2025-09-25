const request = require('supertest');
const express = require('express');
const questsRouter = require('./quests');

jest.mock('firebase-admin', () => ({
  firestore: jest.fn(),
  auth: jest.fn()
}));

jest.mock('firebase-admin/firestore', () => ({
  GeoPoint: jest.fn((lat, lng) => ({ lat, lng })),
  FieldValue: {
    serverTimestamp: jest.fn(() => 'timestamp'),
    arrayUnion: jest.fn(val => `arrayUnion(${val})`),
    arrayRemove: jest.fn(val => `arrayRemove(${val})`)
  }
}));

const admin = require('firebase-admin');

const app = express();
app.use(express.json());
app.use('/quests', questsRouter);

describe('Quests API', () => {
    let mockDb, mockAuth;

    beforeEach(() => {
        mockDb = {
            collection: jest.fn().mockReturnThis(),
            doc: jest.fn().mockReturnThis(),
            get: jest.fn(),
            add: jest.fn(),
            runTransaction: jest.fn()
        };
        mockAuth = {
            verifyIdToken: jest.fn()
        };
        admin.firestore.mockReturnValue(mockDb);
        admin.auth.mockReturnValue(mockAuth);
        
        // Reset mocks but keep the return values
        mockDb.collection.mockClear().mockReturnThis();
        mockDb.doc.mockClear().mockReturnThis();
        mockDb.get.mockClear();
        mockDb.add.mockClear();
        mockDb.runTransaction.mockClear();
        mockAuth.verifyIdToken.mockClear();
    });

    describe('GET /', () => {
        it('should return all quests', async () => {
            const mockQuests = [{ name: 'Test Quest' }];
            mockDb.get.mockResolvedValue({
                forEach: jest.fn(callback => {
                    mockQuests.forEach((quest, index) => {
                        callback({ id: `quest${index}`, data: () => quest });
                    });
                })
            });

            const response = await request(app).get('/quests');

            expect(response.status).toBe(200);
            expect(response.body).toEqual([{ id: 'quest0', name: 'Test Quest' }]);
        });
    });

    describe('POST /', () => {
        it('should create quest when authenticated', async () => {
            mockAuth.verifyIdToken.mockResolvedValue({ uid: 'user123' });
            mockDb.add.mockResolvedValue({ id: 'quest123' });

            const questData = {
                name: 'New Quest',
                radius: 100,
                reward: 50,
                type: 'treasure',
                lat: 40.7128,
                lng: -74.0060,
                imageUrl: 'test.jpg',
                emoji: '🎯',
                color: 'blue',
                creatorName: 'Test User'
            };

            const response = await request(app)
                .post('/quests')
                .set('Authorization', 'Bearer validtoken')
                .send(questData);

            expect(response.status).toBe(201);
            expect(response.body.message).toContain('Quest "New Quest" added successfully!');
        });

        it('should return 401 without auth', async () => {
            const response = await request(app).post('/quests').send({});
            expect(response.status).toBe(401);
        });
    });

    describe('PATCH /:questId/accept', () => {
        it('should accept quest when authenticated', async () => {
            mockAuth.verifyIdToken.mockResolvedValue({ uid: 'user123' });
            mockDb.runTransaction.mockImplementation(callback => callback({
                getAll: jest.fn().mockResolvedValue([
                    { exists: true },
                    { exists: true }
                ]),
                update: jest.fn()
            }));

            const response = await request(app)
                .patch('/quests/quest123/accept')
                .set('Authorization', 'Bearer validtoken');

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Quest accepted successfully');
        });
    });

    describe('DELETE /:questId', () => {
        it('should delete quest when creator', async () => {
            mockAuth.verifyIdToken.mockResolvedValue({ uid: 'creator123' });
            mockDb.runTransaction.mockImplementation(callback => callback({
                get: jest.fn().mockResolvedValue({
                    exists: true,
                    data: () => ({ creatorId: 'creator123', acceptedBy: [] })
                }),
                delete: jest.fn()
            }));

            const response = await request(app)
                .delete('/quests/quest123')
                .set('Authorization', 'Bearer validtoken');

            expect(response.status).toBe(200);
        });
    });

    describe('PATCH /:questId/abandon', () => {
        it('should abandon quest when authenticated', async () => {
            mockAuth.verifyIdToken.mockResolvedValue({ uid: 'user123' });
            mockDb.runTransaction.mockImplementation(callback => callback({
                getAll: jest.fn().mockResolvedValue([
                    { exists: true },
                    { exists: true }
                ]),
                update: jest.fn()
            }));

            const response = await request(app)
                .patch('/quests/quest123/abandon')
                .set('Authorization', 'Bearer validtoken');

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Quest abandoned successfully');
        });
    });
});