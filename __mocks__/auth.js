// __mocks__/auth.js
module.exports.authenticate = (req, res, next) => {
  req.user = { uid: 'test-user-id' }; // Mocked authenticated user
  next();
};
