const FieldValue = {
  serverTimestamp: jest.fn(() => 'mock-timestamp'),
  arrayUnion: jest.fn((val) => val),
  arrayRemove: jest.fn((val) => val),
};

const GeoPoint = jest.fn((lat, lng) => ({ lat, lng }));

const firestoreMock = {
  collection: jest.fn(() => ({
    doc: jest.fn(() => ({
      set: jest.fn(() => Promise.resolve()),
      get: jest.fn(() =>
        Promise.resolve({ exists: true, data: () => ({ Name: 'Test User' }) })
      ),
      update: jest.fn(() => Promise.resolve()),
      delete: jest.fn(() => Promise.resolve()),
    })),
    add: jest.fn(() => Promise.resolve({ id: 'mock-id' })),
    get: jest.fn(() =>
      Promise.resolve({ forEach: (fn) => fn({ id: '1', data: () => ({ name: 'Quest 1' }) }) })
    ),
  })),
  runTransaction: jest.fn(async (cb) =>
    cb({
      getAll: jest.fn(async () => [
        { exists: true, data: () => ({ creatorId: 'test-user-id', acceptedBy: [] }) },
        { exists: true, data: () => ({ acceptedQuests: [] }) },
      ]),
      update: jest.fn(),
      delete: jest.fn(),
    })
  ),
};

const storageMock = {
  bucket: jest.fn(() => ({
    file: jest.fn(() => ({
      save: jest.fn(() => Promise.resolve()),
    })),
    name: 'mock-bucket',
  })),
};

const authMock = {
  verifyIdToken: jest.fn(() => Promise.resolve({ uid: 'test-user-id' })),
};

module.exports = {
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  auth: jest.fn(() => authMock),
  firestore: jest.fn(() => firestoreMock), // firestore function
  storage: jest.fn(() => storageMock),

  // ✅ Add FieldValue and GeoPoint directly on the module (like real firebase-admin)
  FieldValue,
  GeoPoint,
};
