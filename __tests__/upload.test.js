const request = require('supertest');
const { app } = require('../app');
const path = require('path');

jest.mock('firebase-admin');
jest.mock('../functions/auth'); // adjust path to your auth file

describe('Upload API', () => {
  it('POST /api/upload/image should upload an image successfully', async () => {
    const res = await request(app)
      .post('/api/upload/image')
      .set('Authorization', 'Bearer test-token')
      .attach('image', path.join(__dirname, 'test-image.jpg')); // Create a small dummy image in __tests__ folder

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Image uploaded successfully!');
    expect(res.body.imageUrl).toContain('https://storage.googleapis.com/mock-bucket/');
  });

  it('POST /api/upload/image without a file should return 400', async () => {
    const res = await request(app)
      .post('/api/upload/image')
      .set('Authorization', 'Bearer test-token');
    
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('No image file uploaded.');
  });

  it('POST /api/upload/image with invalid auth should return 401', async () => {
    jest.mocked(require('firebase-admin').auth).mockImplementationOnce(() => ({
      verifyIdToken: jest.fn(() => { throw new Error('Invalid token'); }),
    }));

    const res = await request(app)
      .post('/api/upload/image')
      .attach('image', path.join(__dirname, 'test-image.jpg'));
    
    expect(res.statusCode).toBe(401);
  });
});
