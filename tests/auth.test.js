const { authenticate } = require('../functions/auth');
const admin = require('firebase-admin');

jest.mock('firebase-admin');

describe('authenticate middleware', () => {
    let req, res, next;

    beforeEach(() => {
        req = { headers: {} };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        next = jest.fn();
        jest.clearAllMocks();
    });

    it('should return 401 when no authorization header', async () => {
        await authenticate(req, res, next);
        
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized: Missing or invalid token' });
        expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when token is invalid format', async () => {
        req.headers.authorization = 'InvalidToken';
        
        await authenticate(req, res, next);
        
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized: Missing or invalid token' });
    });

    it('should call next when token is valid', async () => {
        const mockDecodedToken = { uid: 'user123' };
        admin.auth = jest.fn().mockReturnValue({
            verifyIdToken: jest.fn().mockResolvedValue(mockDecodedToken)
        });
        req.headers.authorization = 'Bearer validtoken';
        
        await authenticate(req, res, next);
        
        expect(req.user).toBe(mockDecodedToken);
        expect(next).toHaveBeenCalled();
    });

    it('should return 401 when token verification fails', async () => {
        admin.auth = jest.fn().mockReturnValue({
            verifyIdToken: jest.fn().mockRejectedValue(new Error('Invalid token'))
        });
        req.headers.authorization = 'Bearer invalidtoken';
        
        await authenticate(req, res, next);
        
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized: Invalid token' });
        expect(next).not.toHaveBeenCalled();
    });
});