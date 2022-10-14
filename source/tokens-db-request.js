const jsonwebtoken = require('jsonwebtoken');
const { getRequest, postRequest } = require('./db-shared');

const jwt_secret = Buffer.from(process.env.EXT_CLIENT_SECRET, 'base64');

const tokensPath = 'key-store/tokens';

/**
 * Verifies and decodes a jwt
 * @param jwt_token a jwt to verify and decode
 * @returns the javascript object based on the allowed types
 */
 function verifyJwt(jwt_token) {
    return jsonwebtoken.verify(jwt_token, jwt_secret, { algorithms: ['HS256'] });
}

/**
 * Creates a jwt
 * @param payload the javascript object to create in the jwt payload
 * @returns the jwt as a string
 */
 function signJwt(payload) {
    return jsonwebtoken.sign(payload, jwt_secret, { algorithm: 'HS256' });
}

/**
 * 
 * @returns the tokens secret containing a jwt 
 */
async function readJwt() {
    return getRequest(tokensPath).then(r => r.json());
}

/**
 * 
 * @param jwt_token the jwt to store
 * @returns  
 */
async function writeJwt(jwt_token) {
    return postRequest(tokensPath, jwt_token);
}

module.exports = {
    verifyJwt,
    signJwt,
    readJwt,
    writeJwt
};