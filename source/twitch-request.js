"use strict";

const fetch = require('node-fetch');
const crypto = require('crypto');
const TwitchOAuth = require('@callowcreation/basic-twitch-oauth');

const buffer = crypto.randomBytes(16);
const state = buffer.toString('hex');

const twitchOAuth = new TwitchOAuth({
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    redirect_uri: process.env.REDIRECT_URI,
    scopes: [
        'user:edit:broadcast'
    ]
}, state);

async function authorize(code, state) {
    if (twitchOAuth.confirmState(state)) {
        return twitchOAuth.fetchToken(code);
    }
    return { success: false };
}

async function getUserExtensions(user_id) {
    return twitchOAuth.getEndpoint(`https://api.twitch.tv/helix/users/extensions?user_id=${user_id}`);
}

async function getUserByName(username) {
    return twitchOAuth.getEndpoint(`https://api.twitch.tv/helix/users?login=${username}`);
}

async function getUserById(user_id) {
    return fetch(`https://api.twitch.tv/kraken/users/${user_id}`, {
        method: 'GET',
        headers: {
            'Accept': 'application/vnd.twitchtv.v5+json',
            'Client-ID': process.env.CLIENT_ID,
        }
    }).then(result => result.json());
}

module.exports = {
    authorizeUrl: twitchOAuth.authorizeUrl,
    authorize,
    getUserById,
    getUserExtensions,
    getUserByName
};