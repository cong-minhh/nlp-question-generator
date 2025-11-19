/**
 * API Authentication Middleware
 * Supports both public and private modes
 */

/**
 * Check if API is in private mode
 */
function isPrivateMode() {
    return process.env.API_MODE === 'private';
}

/**
 * Validate API key
 */
function isValidApiKey(providedKey) {
    const serverApiKey = process.env.SERVER_API_KEY;
    
    // If no server API key is set, authentication is disabled
    if (!serverApiKey || serverApiKey.trim() === '') {
        return true;
    }
    
    return providedKey === serverApiKey;
}

/**
 * Authentication middleware
 */
function authenticate(req, res, next) {
    // If in public mode, allow all requests
    if (!isPrivateMode()) {
        return next();
    }
    
    // In private mode, check for API key
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!apiKey) {
        return res.status(401).json({
            error: 'Authentication required',
            message: 'API key is required. Please provide an API key in the X-API-Key header or Authorization header.',
            statusCode: 401
        });
    }
    
    if (!isValidApiKey(apiKey)) {
        return res.status(403).json({
            error: 'Invalid API key',
            message: 'The provided API key is invalid.',
            statusCode: 403
        });
    }
    
    // Valid API key, proceed
    next();
}

/**
 * Optional authentication middleware (for endpoints that work in both modes)
 */
function optionalAuth(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    
    // Mark request as authenticated if valid key provided
    if (apiKey && isValidApiKey(apiKey)) {
        req.authenticated = true;
    } else {
        req.authenticated = false;
    }
    
    next();
}

module.exports = {
    authenticate,
    optionalAuth,
    isPrivateMode,
    isValidApiKey
};
