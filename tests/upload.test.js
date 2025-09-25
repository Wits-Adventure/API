const request = require('supertest');
const express = require('express');
const uploadRouter = require('../routes/upload');

jest.mock('firebase-admin', () => ({
  auth: jest.fn(),
  storage: jest.fn()
}));

const admin = require('firebase-admin');

const app = express();
app.use('/upload', uploadRouter);

describe('Upload API', () => {
    let mockAuth, mockStorage, mockBucket, mockFile;

    beforeEach(() => {
        mockFile = {
            save: jest.fn()
        };
        mockBucket = {
            file: jest.fn(() => mockFile),
            name: 'test-bucket'
        };
        mockStorage = {
            bucket: jest.fn(() => mockBucket)
        };
        mockAuth = {
            verifyIdToken: jest.fn()
        };
        
        admin.auth.mockReturnValue(mockAuth);
        admin.storage.mockReturnValue(mockStorage);
        
        jest.clearAllMocks();
    });

    describe('POST /image', () => {
        it('should upload image when authenticated', async () => {
            mockAuth.verifyIdToken.mockResolvedValue({ uid: 'user123' });
            mockFile.save.mockResolvedValue();

            const response = await request(app)
                .post('/upload/image')
                .set('Authorization', 'Bearer validtoken')
                .attach('image', Buffer.from('fake image'), 'test.jpg');

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Image uploaded successfully!');
            expect(response.body.imageUrl).toContain('storage.googleapis.com');
        });

        it('should return 401 without auth', async () => {
            const response = await request(app)
                .post('/upload/image')
                .attach('image', Buffer.from('fake image'), 'test.jpg');

            expect(response.status).toBe(401);
            expect(response.body.error).toBe('Unauthorized: Missing or invalid token');
        });

        it('should return 400 without image', async () => {
            mockAuth.verifyIdToken.mockResolvedValue({ uid: 'user123' });

            const response = await request(app)
                .post('/upload/image')
                .set('Authorization', 'Bearer validtoken');

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('No image file uploaded.');
        });

        it('should return 500 on storage error', async () => {
            mockAuth.verifyIdToken.mockResolvedValue({ uid: 'user123' });
            mockFile.save.mockRejectedValue(new Error('Storage error'));

            const response = await request(app)
                .post('/upload/image')
                .set('Authorization', 'Bearer validtoken')
                .attach('image', Buffer.from('fake image'), 'test.jpg');

            expect(response.status).toBe(500);
            expect(response.body.error).toBe('Failed to upload file to Cloud Storage.');
        });
    });
});