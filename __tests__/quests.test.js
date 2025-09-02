const request = require('supertest');
const { app } = require('../app');

jest.mock('firebase-admin'); // use your __mocks__/firebase-admin.js
jest.mock('../functions/auth'); // use your __mocks__/auth.js

// Increase Jest timeout in case of async delays
jest.setTimeout(10000);

describe('Quests API', () => {
  it('GET /api/quests', async () => {
    const res = await request(app).get('/api/quests');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Check mock data
    expect(res.body[0]).toHaveProperty('id');
    expect(res.body[0]).toHaveProperty('name');
  });

  it('POST /api/quests', async () => {
    const res = await request(app).post('/api/quests').send({
      name: 'Quest',
      radius: 10,
      reward: 100,
      type: 'Adventure',
      lat: 0,
      lng: 0,
      imageUrl: '',
      emoji: '',
      color: '',
      creatorName: 'Tester',
    });
    expect(res.statusCode).toBe(201);
    // Match your firestore mock id
    expect(res.body.questId).toBe('mock-id'); 
  });

  it('PATCH /api/quests/:questId/accept', async () => {
    const res = await request(app).patch('/api/quests/mock-id/accept');
    expect(res.statusCode).toBe(200);
  });

  it('PATCH /api/quests/:questId/abandon', async () => {
    const res = await request(app).patch('/api/quests/mock-id/abandon');
    expect(res.statusCode).toBe(200);
  });

  it('DELETE /api/quests/:questId', async () => {
    const res = await request(app).delete('/api/quests/mock-id');
    expect(res.statusCode).toBe(200);
  });
});
