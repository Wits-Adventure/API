const request = require('supertest');
const express = require('express');

// Create the mock objects first
const mockDb = {
  collection: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  set: jest.fn(),
  get: jest.fn(),
};

const mockAuth = {
  verifyIdToken: jest.fn()
};

// Mock firebase-admin before requiring any modules that use it
jest.mock('firebase-admin', () => {
  // Create a proper mock that matches the actual Firebase Admin structure
  const mockFirestoreInstance = () => ({
    collection: mockDb.collection,
    doc: mockDb.doc,
    set: mockDb.set,
    get: mockDb.get,
  });
  
  // Add FieldValue as a property of the firestore function
  mockFirestoreInstance.FieldValue = {
    serverTimestamp: jest.fn(() => 'timestamp')
  };
  
  return {
    firestore: mockFirestoreInstance,
    auth: jest.fn(() => mockAuth)
  };
});

// Mock the auth middleware
jest.mock('../functions/auth', () => ({
  authenticate: jest.fn((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }
    
    // Simulate token verification
    const token = authHeader.replace('Bearer ', '');
    if (token === 'validtoken') {
      // Mock the verifyIdToken behavior
      const admin = require('firebase-admin');
      admin.auth().verifyIdToken(token)
        .then(decodedToken => {
          req.user = decodedToken;
          next();
        })
        .catch(() => {
          res.status(401).json({ error: 'Invalid token' });
        });
    } else {
      res.status(401).json({ error: 'Invalid token' });
    }
  })
}));

// Now require the router after mocks are set up
const usersRouter = require('../routes/users');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());
app.use('/users', usersRouter);

describe('Users API', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Reset mock implementations
    mockDb.collection.mockReturnThis();
    mockDb.doc.mockReturnThis();
    mockDb.set.mockResolvedValue();
    mockDb.get.mockResolvedValue({ exists: false });
  });

  describe('POST /', () => {
    it('should create user when authenticated with matching userId', async () => {
      // Setup auth mock
      mockAuth.verifyIdToken.mockResolvedValue({ uid: 'user123' });
      
      // Setup database mock
      mockDb.set.mockResolvedValue();

      const userData = {
        userId: 'user123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'player'
      };

      const response = await request(app)
        .post('/users')
        .set('Authorization', 'Bearer validtoken')
        .send(userData);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('User added successfully');
      
      // Verify the database methods were called
      expect(mockDb.collection).toHaveBeenCalledWith('Users');
      expect(mockDb.doc).toHaveBeenCalledWith('user123');
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          Email: 'test@example.com',
          Name: 'Test User',
          Role: 'player',
          LeaderBoardPoints: 0,
          Level: 0,
          CompletedQuests: [],
          Bio: "",
          SpendablePoints: 0,
          Experience: 0,
          Quests: [],
          joinedAt: 'timestamp'
        })
      );
    });

    it('should return 403 when userId mismatch', async () => {
      mockAuth.verifyIdToken.mockResolvedValue({ uid: 'user123' });

      const userData = {
        userId: 'different-user',
        email: 'test@example.com',
        name: 'Test User',
        role: 'player'
      };

      const response = await request(app)
        .post('/users')
        .set('Authorization', 'Bearer validtoken')
        .send(userData);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden: User ID mismatch');
      
      // Verify set was not called due to authorization failure
      expect(mockDb.set).not.toHaveBeenCalled();
    });

    it('should return 401 without auth header', async () => {
      const response = await request(app)
        .post('/users')
        .send({
          userId: 'user123',
          email: 'test@example.com'
        });
        
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('No authorization header');
    });

    it('should return 500 when database operation fails', async () => {
      mockAuth.verifyIdToken.mockResolvedValue({ uid: 'user123' });
      mockDb.set.mockRejectedValue(new Error('Database error'));

      const userData = {
        userId: 'user123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'player'
      };

      const response = await request(app)
        .post('/users')
        .set('Authorization', 'Bearer validtoken')
        .send(userData);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to add user');
      expect(response.body.details).toBe('Database error');
    });
  });

  describe('GET /:userId', () => {
    it('should get user data when authenticated with matching userId', async () => {
      mockAuth.verifyIdToken.mockResolvedValue({ uid: 'user123' });
      
      const mockUserData = {
        Name: 'Test User',
        Email: 'test@example.com',
        Role: 'player',
        Level: 5,
        Experience: 1500
      };
      
      mockDb.get.mockResolvedValue({
        exists: true,
        data: () => mockUserData
      });

      const response = await request(app)
        .get('/users/user123')
        .set('Authorization', 'Bearer validtoken');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockUserData);
      
      // Verify the correct database methods were called
      expect(mockDb.collection).toHaveBeenCalledWith('Users');
      expect(mockDb.doc).toHaveBeenCalledWith('user123');
      expect(mockDb.get).toHaveBeenCalled();
    });

    it('should return 403 when accessing other user data', async () => {
      mockAuth.verifyIdToken.mockResolvedValue({ uid: 'user123' });

      const response = await request(app)
        .get('/users/different-user')
        .set('Authorization', 'Bearer validtoken');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden: Cannot access other user data');
      
      // Verify get was not called due to authorization failure
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    it('should return 404 when user not found', async () => {
      mockAuth.verifyIdToken.mockResolvedValue({ uid: 'user123' });
      mockDb.get.mockResolvedValue({ 
        exists: false 
      });

      const response = await request(app)
        .get('/users/user123')
        .set('Authorization', 'Bearer validtoken');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User document not found');
    });

    it('should return 401 without auth header', async () => {
      const response = await request(app)
        .get('/users/user123');
        
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('No authorization header');
    });

    it('should return 500 when database operation fails', async () => {
      mockAuth.verifyIdToken.mockResolvedValue({ uid: 'user123' });
      mockDb.get.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/users/user123')
        .set('Authorization', 'Bearer validtoken');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to fetch user data');
      expect(response.body.details).toBe('Database connection failed');
    });
  });
});