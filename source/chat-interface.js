"use strict";

const tmi = require('tmi.js');
const dbRequest = require('./channels-db-request');
const twitchRequest = require('./twitch-request');

const shoutouts = {};

const WAIT_ON_FAILED_JOIN_MS = 1000 * 10;

const SPAM_USER_SHOUTOUT_TIME_MS = 1000 * 60;

const MAX_RETRIES = 5;

let retriesCounter = 0;
let multiplier = 2.0;
let currentFailedMS = WAIT_ON_FAILED_JOIN_MS;

const client = new tmi.client({
	options: { debug: false },
	connection: {
		reconnect: true,
		secure: true
	},
	identity: {
		username: process.env.BOT_USERNAME,
		password: process.env.OAUTH_TOKEN
	},
	channels: []
});

function getUsername(term, msg) {
	const username = msg.substr(term.length).replace(/@/g, '').toLowerCase();
	const lastIndex = username.lastIndexOf('/') + 1;
	return username.substr(lastIndex);
}

async function joinChannel({ id, login }) {
	if (retriesCounter >= MAX_RETRIES) {
		console.log(`MAX_RETRIES ${retriesCounter} of ${MAX_RETRIES} for channel ${id}`);
		retriesCounter = 0;
		currentFailedMS = WAIT_ON_FAILED_JOIN_MS;
		return -1;
	}

	try {
		if (!id || !login) {
			console.log(`Channel lookup ${id} failed join attempt skipped.`);
			return -1;
		}
		const joined = await client.join(login);
		console.log(`Join ${retriesCounter} of ${MAX_RETRIES} retries for channel ${id} ${login} ${joined[0]}`);
		retriesCounter = 0;
		return 1;
	} catch (error) {
		const username = login ? login : 'NO USER FOUND'
		console.log(`FAILED ${currentFailedMS / 1000}s Join channel ${username} ${id} - RETRIES ${retriesCounter} of ${MAX_RETRIES}`);
		console.error(error);
		if (error === 'msg_banned' || error === 'msg_channel_suspended') {
			return -1;
		} else if (error === 'No response from Twitch.') {
			await new Promise(resolve => setTimeout(resolve, WAIT_ON_FAILED_JOIN_MS));
			++retriesCounter;
			currentFailedMS += currentFailedMS * multiplier;
			return -2;
		}
		return -1;
	}
}

async function partChannelById(channel_id) {
	try {
		const { data: [user] } = await twitchRequest.getUserById(channel_id);
		const parted = await client.part(user.login);
		console.log(`Part channel ${channel_id} ${user.display_name} ${parted[0]}`);
	} catch (error) {
		console.log(`FAILED Part channel ${channel_id}`);
		console.error(error);
	}
}

async function sendShoutout(username, channel, channel_id, posted_by, is_auto) {
	try {
		
		if (shoutouts[channel] &&
			(shoutouts[channel].username === username &&
				shoutouts[channel].timestamp > Date.now())) return;

		shoutouts[channel] = { username, timestamp: Date.now() + SPAM_USER_SHOUTOUT_TIME_MS };

		const twitchUsers = await twitchRequest.getUserByName(username);
		if (twitchUsers.data.length === 0) return;

		const { data } = await twitchRequest.getUserExtensions(channel_id);
		if (!data) return;

		let activePanel = null;

		for (const panelId in data.panel) {
			const panel = data.panel[panelId];
			if (panel.name === 'Shoutouts for Streamers') {
				activePanel = panel;
			}
		}

		if (activePanel && activePanel.active === true) {
			const result_add = await dbRequest.addShoutout(channel_id, { username, posted_by, is_auto });
			console.log(`${channel} ${channel_id} : Add ${username} : Status ${result_add.status}`);
		} else {
			const result_remove = await dbRequest.removeChannel(channel_id);
			await partChannelById(channel_id);
			console.log(`${channel} ${channel_id} : Not Active : Status ${result_remove.status}`);
		}

	} catch (err) {
		console.error(err);
	}
}

async function onMessage(channel, user, message, self) {

	if (self) return;
	if (!user.badges) return;

	const pred = x => x === 'broadcaster' || x === 'moderator' || x === 'vip';
	if (!Object.keys(user.badges).find(pred)) return;

	const msg = message.trim();

	const term = '!sotest '; // use while deploying hosted test
	/*const term = process.env.IS_DEV_ENV
		? '!sotest '
		: '!so ';*/

	if (msg.indexOf(term) === 0) {

		const username = getUsername(term, msg);
		const channelId = user['room-id'];
		const posted_by = user.username;

		await sendShoutout(username, channel, channelId, posted_by, false);
	}
}

async function onRaided(channel, username, viewers) {

	const cleanedChannel = channel.substring(1);
	const twitchUsers = await twitchRequest.getUserByName(cleanedChannel);
	if (twitchUsers.data.length === 0) return;

	const channelId = twitchUsers.data[0].id;
	const posted_by = 'SfS';

	await sendShoutout(username.toLowerCase(), channel, channelId, posted_by, true);
}

module.exports = {
	connect: () => client.connect(),
	listen: () => {
		client.on('message', onMessage);
		client.on("raided", onRaided);
	},
	joinChannel
};