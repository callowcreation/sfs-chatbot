"use strict";

const fetch = require('node-fetch');

const baseUrl = process.env.IS_DEV_ENV
	? 'http://localhost:5000'
	: 'https://shoutouts-for-streamers.firebaseapp.com';

const headers = {
	'Content-Type': 'application/json',
	'Authorization': 'Basic ' + (Buffer.from(process.env.EXT_CLIENT_ID + ':' + process.env.EXT_CLIENT_SECRET).toString('base64'))
};

function url(endpoint) {
	const path = `${baseUrl}/${endpoint}`;
	//console.log(`ENV_PATH_ENDPOINT------> ${path}`);
	return path;
}

function getFirebaseRequest(path) {
	return fetch(url(path), {
		method: 'GET',
		headers: headers
	});
}

function postFirebaseRequest(path, data) {
	return fetch(url(path), {
		method: 'POST',
		headers: headers,
		body: JSON.stringify(data)
	});
}

module.exports = {
	get: getFirebaseRequest,
	post: postFirebaseRequest,
	getChannels: () => getFirebaseRequest('channels/ids'),
	postSettings: (channelId) => postFirebaseRequest('channels/settings', { channelId }),
	addShoutout: (channelId, { username, posted_by }) => postFirebaseRequest('channels/shoutouts/add', { channelId, username, posted_by }),
	removeChannel: (channelId) => postFirebaseRequest('channels/remove', { channelId })
};