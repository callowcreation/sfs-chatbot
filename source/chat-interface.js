"use strict";

const tmi = require('tmi.js');
const dbRequest = require('./db-request');
const twitchRequest = require('./twitch-request');

const shoutouts = {};

const WAIT_ON_FAILED_JOIN_MS = 1000 * 10;

const SPAM_USER_SHOUTOUT_TIME_MS = 1000 * 60;

const MAX_RETRIES = 20;

let retriesCounter = 0;
let multiplier = 2.0;
let currentFailedMS = WAIT_ON_FAILED_JOIN_MS;

const client = new tmi.client({
	connection: {
		cluster: "aws",
		reconnect: true
	},
	identity: {
		username: process.env.BOT_USERNAME,
		password: process.env.OAUTH_TOKEN
	},
	channels: []
});

client.on('message', onMessage);

function getUsername(term, msg) {
	const username = msg.substr(term.length).replace(/@/g, '').toLowerCase();
	const lastIndex = username.lastIndexOf('/') + 1;
	return username.substr(lastIndex);
}

async function joinChannelById(channel_id) {
	if (retriesCounter >= MAX_RETRIES) {
		console.log(`MAX_RETRIES ${retriesCounter} of ${MAX_RETRIES} for channel ${channel_id}`);
		return;
	}
	try {
		const user = await twitchRequest.getUserById(channel_id);
		const joined = await client.join(user.name);
		console.log(`Join ${retriesCounter} of ${MAX_RETRIES} retries for channel ${channel_id} ${user.display_name} ${joined[0]}`);
		retriesCounter = 0;
	} catch (error) {
		console.log(`FAILED Join channel ${channel_id} - RETRIES ${retriesCounter} of ${MAX_RETRIES}`);
		console.error(error);

		await new Promise(resolve => setTimeout(resolve, WAIT_ON_FAILED_JOIN_MS));
		++retriesCounter;
		currentFailedMS += currentFailedMS * multiplier;
	}
}

async function partChannelById(channel_id) {
	try {
		const user = await twitchRequest.getUserById(channel_id);
		const parted = await client.part(user.name);
		console.log(`Part channel ${channel_id} ${user.display_name} ${parted[0]}`);
	} catch (error) {
		console.log(`FAILED Part channel ${channel_id}`);
		console.error(error);
	}
}

async function onMessage(channel, user, message, self) {

	if (self) return;
	if (channel.replace(/#/g, '') !== user.username && user.mod === false) return;

	const msg = message.trim();

	const term = process.env.IS_DEV_ENV
		? '!sotest '
		: '!so ';

	if (msg.indexOf(term) === 0) {

		const username = getUsername(term, msg);

		// validate user sending !so command
		// is mod or is vip from reading the settings
		// dbRequest.postSettings(user['room-id'])

		try {

			const isAllowed = await twitchRequest.isAllowedUser(user['room-id'], user['user-id']);
			if (!isAllowed) return;

			if (shoutouts[channel] &&
				(shoutouts[channel].username === username &&
					shoutouts[channel].timestamp > Date.now())) return;

			shoutouts[channel] = { username, timestamp: Date.now() + SPAM_USER_SHOUTOUT_TIME_MS };

			const twitchUsers = await twitchRequest.getUserByName(username);
			if (twitchUsers.data.length === 0) return;

			const { data } = await twitchRequest.getUserExtensions(user['room-id']);
			if (!data) return;

			let activePanel = null;

			for (const panelId in data.panel) {
				const panel = data.panel[panelId];
				if (panel.name === 'Shoutouts for Streamers') {
					activePanel = panel;
				}
			}

			if (activePanel && activePanel.active === true) {
				const result_add = await dbRequest.addShoutout(user['room-id'], { username, posted_by: user.username });
				console.log(`${channel} ${user['room-id']} : Add ${username} : Status ${result_add.status}`);
			} else {
				const result_remove = await dbRequest.removeChannel(user['room-id']);
				await partChannelById(user['room-id']);
				console.log(`${channel} ${user['room-id']} : Not Active : Status ${result_remove.status}`);
			}

		} catch (error) {
			console.log(error);
		}
	}
}

module.exports = {
	connect: () => client.connect(),
	joinChannel: joinChannelById
};