"use strict";

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const qs = require('querystring');

const { Queue } = require('./queue');
const chatInterface = require('./source/chat-interface');
const dbRequest = require('./source/db-request');
const twitchRequest = require('./source/twitch-request');

const delayMs = 150;
const joinQueue = {
	items: new Queue(),
	isBusy: false
};

const app = express();
app.use(bodyParser.json());

if (module === require.main) {
	chatInterface.connect();

	app.get('/', (req, res) => {
		res.status(200).send(`<a href="/authorize">Authorize</a>`);
	});

	app.get('/test', (req, res) => {
		twitchRequest.getUserExtensions('75987197').then(json => res.status(200).json(json))
			.catch(e => console.error(e));
	});

	app.get('/home', (req, res) => {
		res.status(200).send(`<a href="/test">Test</a>`);
	});

	app.post('/join', async (req, res) => {
		if (verifyAuthorization(req)) {
			await chatInterface.joinChannel(req.body.channelId);
			res.end();
		} else {
			res.status(404).end();
		}
	});

	app.post('/ping', async (req, res) => {
		if (verifyAuthorization(req)) {
			twitchRequest.getUserExtensions('75987197').then(json => {
				res.status(200).json(json);
			}).catch(e => console.error(e));
		} else {
			res.status(404).end();
		}
	});

	app.get('/authorize', (req, res) => {
		res.redirect(twitchRequest.authorizeUrl);
	});

	app.get('/auth-callback', async (req, res) => {
		const req_data = qs.parse(req.url.split('?')[1]);
		const code = req_data['code'];
		const state = req_data['state'];

		try {
			const auth = await twitchRequest.authorize(code, state);
			if (auth.success === true) {
				console.log('authenticated');

				const { ids } = await dbRequest.getChannels().then(r => r.json());
				//const ids = ['75987197'];

				for (let i = 0; i < ids.length; i++) {
					joinQueue.items.enqueue(ids[i]);
					if (i === 0) join();
				}
				join();
				res.redirect('/home');
			} else {
				res.redirect('/failed');
			}
		} catch (error) {
			console.error(error);
			res.redirect('/failed');
		}
	});

	const server = app.listen(process.env.PORT || 7000, () => {
		const port = server.address().port;
		console.log(`App listening on port ${port}`);

		const open = require('open');
		open(twitchRequest.authorizeUrl);
	});
}

function verifyAuthorization(req) {
	return req.headers['authorization'] === 'Basic ' + (Buffer.from(process.env.EXT_CLIENT_ID + ':' + process.env.EXT_CLIENT_SECRET).toString('base64'));
}

async function join() {
	if (joinQueue.items.size() === 0) return;
	if (joinQueue.isBusy === true) return;
	joinQueue.isBusy = true;

	const channel_id = joinQueue.items.peek();

	const response = await twitchRequest.getUserExtensions(channel_id);

	let activePanel = null;

	if (response.data) {
		for (const panelId in response.data.panel) {
			const panel = response.data.panel[panelId];
			if (panel.name === 'Shoutouts for Streamers') {
				activePanel = panel;
			}
		}
	} else {
		console.error(response);
	}

	if (activePanel && activePanel.active === true) {
		await chatInterface.joinChannel(channel_id);
	} else {
		await dbRequest.removeChannel(channel_id);
	}

	await new Promise(resolve => setTimeout(resolve, delayMs));
	joinQueue.items.dequeue();
	joinQueue.isBusy = false;
	join();
}

