"use strict";

const fetch = require('node-fetch');
const crypto = require('crypto');
const TwitchOAuth = require('@callowcreation/basic-twitch-oauth');

const HELIX_API_BASE_PATH = 'https://api.twitch.tv/helix';
const VALIDATE_API_PATH = 'https://id.twitch.tv/oauth2/validate';
const REVOKE_API_PATH = 'https://id.twitch.tv/oauth2/revoke';

const buffer = crypto.randomBytes(16);
const state = buffer.toString('hex');

const twitchOAuth = new TwitchOAuth({
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    redirect_uri: process.env.REDIRECT_URI,
    scopes: [
        'user:edit:broadcast',
        'moderation:read'
    ]
}, state);

async function authorize(code, state) {
    twitchOAuth.confirmState(state);
    return twitchOAuth.fetchToken(code);
}

function statusOk(res) {
    return res.status === 200;
}

function getAuthenticated() {
    return twitchOAuth.getAuthenticated();
}

function setAuthenticated(authenticated) {
    return twitchOAuth.setAuthenticated(authenticated);
}

/**
 * Validate an access token
 * 
 * @returns true is the access token is valid false otherwise
 */
async function validate(access_token) {
    const url = VALIDATE_API_PATH;
    const options = {
        headers: {
            'Authorization': `OAuth ${access_token}`
        },
        method: 'GET'
    };
    return fetch(url, options).then(statusOk);
}

async function validateToken() {
    return validate(twitchOAuth.getAuthenticated().access_token);
}

async function revokeToken() {
    const url = `${REVOKE_API_PATH}?client_id=${process.env.CLIENT_ID}&token=${twitchOAuth.authenticated.access_token}`;
    const options = {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        method: 'POST'
    };
    return fetch(url, options).then(statusOk);
}

async function getUserExtensions(user_id) {
    return twitchOAuth.getEndpoint(`${HELIX_API_BASE_PATH}/users/extensions?user_id=${user_id}`);
}

async function getUsers(users) {
    const users_params = users.join('&');
    return twitchOAuth.getEndpoint(`${HELIX_API_BASE_PATH}/users?${users_params}`);
}

async function getUserByName(username) {
    return twitchOAuth.getEndpoint(`${HELIX_API_BASE_PATH}/users?login=${username}`);
}

async function getUserById(user_id) {
    return twitchOAuth.getEndpoint(`${HELIX_API_BASE_PATH}/users?id=${user_id}`);
}

async function getBanned(broadcaster_id, user_id) {
    return twitchOAuth.getEndpoint(`${HELIX_API_BASE_PATH}/moderation/banned?broadcaster_id=${broadcaster_id}&user_id=${user_id}`);
}

async function getModerators(broadcaster_id, user_id) {
    return twitchOAuth.getEndpoint(`${HELIX_API_BASE_PATH}/moderation/moderators?broadcaster_id=${broadcaster_id}&user_id=${user_id}`);
}

/*
    User by user_id is not banned and is a moderator of the channel by broadcaster_id
*/
async function isAllowedUser(broadcaster_id, user_id) {
    const results = await Promise.all([
        isAllowed(broadcaster_id, user_id, getBanned, r => r.data && r.data.length === 0 || r.data),
        isAllowed(broadcaster_id, user_id, getModerators, r => r.data !== null)
    ]);
    return results.every(Boolean);
}

async function isAllowed(broadcaster_id, user_id, func, allowed) {
    return allowed(await func(broadcaster_id, user_id));
}

module.exports = {
    authorizeUrl: twitchOAuth.authorizeUrl,
    authorize,
    getAuthenticated,
    setAuthenticated,
    validate,
    validateToken,
    revokeToken,
    getUserById,
    getUserExtensions,
    getUserByName,
    getUsers,
    isAllowedUser
};