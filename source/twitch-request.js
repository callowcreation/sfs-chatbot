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
		'user:edit:broadcast',
		'moderation:read'
    ]
}, state);

const KRAKEN_API_BASE_PATH = 'https://api.twitch.tv/kraken';
const HELIX_API_BASE_PATH = 'https://api.twitch.tv/helix';

async function authorize(code, state) {
    if (twitchOAuth.confirmState(state)) {
        return twitchOAuth.fetchToken(code);
    }
    return { success: false };
}

async function getUserExtensions(user_id) {
    return twitchOAuth.getEndpoint(`${HELIX_API_BASE_PATH}/users/extensions?user_id=${user_id}`);
}

async function getUserByName(username) {
    return twitchOAuth.getEndpoint(`${HELIX_API_BASE_PATH}/users?login=${username}`);
}

async function getUserById(user_id) {
    return fetch(`${KRAKEN_API_BASE_PATH}/users/${user_id}`, {
        method: 'GET',
        headers: {
            'Accept': 'application/vnd.twitchtv.v5+json',
            'Client-ID': process.env.CLIENT_ID,
        }
    }).then(result => result.json());
}

async function getModeratorEvents(broadcaster_id) {
    return twitchOAuth.getEndpoint(`${HELIX_API_BASE_PATH}/moderation/moderators?broadcaster_id=${broadcaster_id}`);
}
	// Use to get vip  status of user
	// vip status not available from modreation endpoint
async function getUserBadges(user_id, channel_id) {
	return twitchOAuth.getEndpoint(`${KRAKEN_API_BASE_PATH}/users/${user_id}/chat/channels/${channel_id}`);
}

module.exports = {
    authorizeUrl: twitchOAuth.authorizeUrl,
    authorize,
    getUserById,
    getUserExtensions,
	getUserByName,
	getModeratorEvents,
	getUserBadges
};