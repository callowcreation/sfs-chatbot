"use strict";

const fetch = require('node-fetch');
const crypto = require('crypto');
const TwitchOAuth = require('@callowcreation/basic-twitch-oauth');

const KRAKEN_API_BASE_PATH = 'https://api.twitch.tv/kraken';
const HELIX_API_BASE_PATH = 'https://api.twitch.tv/helix';

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

async function getUserExtensions(user_id) {
	return twitchOAuth.getEndpoint(`${HELIX_API_BASE_PATH}/users/extensions?user_id=${user_id}`);
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
	getUserById,
	getUserExtensions,
	getUserByName,
	isAllowedUser
};