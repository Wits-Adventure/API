const request = require('supertest');
const express = require('express');

// Mock Firebase
jest.mock('firebase-admin');
jest.mock('../functions/auth');

const { app } = require('../app'); // import your app

describe('Users API', () => {
  it('POST /api/users should add a user', async () => {
    const newUser = {
      userId: 'test-user-id',
      email: 'alice@test.com',
      name: 'Alice',
      role: 'Player',
    };

    const res = await request(app).post('/api/users').send(newUser);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('User added successfully');
  });

  it('GET /api/users/:userId should return user data', async () => {
    const res = await request(app).get('/api/users/test-user-id');
    expect(res.statusCode).toBe(200);
    expect(res.body.Name).toBe('Alice');
    expect(res.body.Email).toBe('alice@test.com');
  });

  it('GET /api/users/:userId with wrong ID should return 403', async () => {
    const res = await request(app).get('/api/users/wrong-id');
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Forbidden: Cannot access other user data');
  });
});
