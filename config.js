// The necessary configuration for your server
// Contains credentials for your Spotify application
// And the new redirect path for the OAuth flow
// Should be kept secret
module.exports = {
 'PORT': 3333,
 'CLIENT_ID': 'YOUR_CLIENT_ID',
 'CLIENT_SECRET': 'YOUR_CLIENT_SECRET',
 'REDIRECT_URI': 'http://localhost:3333/callback'
};
