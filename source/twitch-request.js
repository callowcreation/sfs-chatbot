"use strict";

const AppAccess = require('@callowcreation/basic-twitch-oauth/src/flows/app-access');

const HELIX_API_BASE_PATH = 'https://api.twitch.tv/helix';

const twitchOAuth = new AppAccess({ client_id: process.env.CLIENT_ID, client_secret: process.env.CLIENT_SECRET });

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

module.exports = {
    twitchOAuth,
    getUserById,
    getUserExtensions,
    getUserByName,
    getUsers
};