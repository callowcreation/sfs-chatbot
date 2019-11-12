require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const qs = require('querystring');

const admin = require("firebase-admin");
const tmi = require('tmi.js');
const fetch = require('node-fetch');
const { Queue } = require('./queue');
const TwitchOAuth = require('@callowcreation/basic-twitch-oauth');

const app = express();

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

const delayMs = 50;
const joinQueue = {
    items: new Queue(),
    isBusy: false
};

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

if (module === require.main) {
    client.connect();

    app.use(bodyParser.json());

    app.get('/', (req, res) => {
        res.status(200).send(`<a href="/authorize">Authorize</a>`);
    });

    app.get('/test', (req, res) => {
        const url = `https://api.twitch.tv/helix/users/extensions?user_id=${101223367}`;
        twitchOAuth.getEndpoint(url).then(json => res.status(200).json(json));
    });

    app.get('/home', (req, res) => {
        res.status(200).send(`<a href="/test">Test</a>`);
    });

    app.get('/authorize', (req, res) => {
        res.redirect(twitchOAuth.authorizeUrl);
    });

    app.get('/auth-callback', (req, res) => {
        const req_data = qs.parse(req.url.split('?')[1]);
        const code = req_data['code'];
        const state = req_data['state'];

        if (twitchOAuth.confirmState(state)) {
            twitchOAuth.fetchToken(code).then(async json => {
                if (json.success === true) {
                    console.log('authenticated');
                    res.redirect('/home');

                    const { ids } = await getFirebaseRequest('channels/ids').then(r => r.json());

                    for (let i = 0; i < ids.length; i++) {
                        joinQueue.items.enqueue(ids[i]);
                        join()
                    }

                } else {
                    res.redirect('/failed');
                }
            });
        } else {
            res.redirect('/failed');
        }

    });

    const server = app.listen(process.env.PORT || 5000, () => {
        const port = server.address().port;
        console.log(`App listening on port ${port}`);

        const url = twitchOAuth.authorizeUrl;
        const open = require('open');
        open(url);
    });
}

async function onMessage(channel, user, message, self) {
    if (self) return;
    if (channel.replace(/#/g, '') !== user.username && user.mod === false) return;

    const msg = message.trim();

    const term = '!so ';
    if (msg.indexOf(term) === 0) {
        try {

            const url = `https://api.twitch.tv/helix/users/extensions?user_id=${user['room-id']}`;
            const { data } = await twitchOAuth.getEndpoint(url)
                .catch(e => console.error(e));

            let activePanel = null;

            for (const panelId in data.panel) {
                const panel = data.panel[panelId];
                if (panel.name === 'Shoutouts for Streamers') {
                    activePanel = panel;
                }
            }

            if (activePanel && activePanel.active === true) {

                const username = getUsername(term, msg);

                const twitchUsers = await twitchOAuth.getEndpoint(`https://api.twitch.tv/helix/users?login=${username}`)
                    .catch(e => console.error(e));

                if (twitchUsers.data.length === 1) {

                    const result_add = await postFirebaseRequest('channels/shoutouts/add', {
                        channelId: user['room-id'],
                        username
                    });

                    console.log(`${channel} ${user['room-id']} : Add ${username} : Status ${result_add.status}`);
                }

            } else {
                const result_remove = await postFirebaseRequest('channels/remove', {
                    channelId: user['room-id']
                });
                await partChannelDataById(user['room-id']);
                console.log(`${channel} ${user['room-id']} : Not Active : Status ${result_remove.status}`);
            }
        } catch (error) {
            console.log(error);
        }
    }
}

function getBaseUrl() {
    //return 'http://localhost:5000';
    return 'https://shoutouts-for-streamers.firebaseapp.com';
}

function getFirebaseRequest(path) {
    return fetch(`${getBaseUrl()}/${path}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + (Buffer.from(process.env.EXT_CLIENT_ID + ':' + process.env.EXT_CLIENT_SECRET).toString('base64'))
        }
    });
}

function postFirebaseRequest(path, data) {
    return fetch(`${getBaseUrl()}/${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + (Buffer.from(process.env.EXT_CLIENT_ID + ':' + process.env.EXT_CLIENT_SECRET).toString('base64'))
        },
        body: JSON.stringify(data)
    });
}

function getUsername(term, msg) {
    const username = msg.substr(term.length).replace(/@/g, '').toLowerCase();
    const lastIndex = username.lastIndexOf('/') + 1;
    return username.substr(lastIndex);
}

async function join() {
    if (joinQueue.items.size() === 0) return;
    if (joinQueue.isBusy === true) return;
    joinQueue.isBusy = true;

    const channel_id = joinQueue.items.peek();

    const url = `https://api.twitch.tv/helix/users/extensions?user_id=${channel_id}`;
    const { data } = await twitchOAuth.getEndpoint(url);

    let activePanel = null;

    for (const panelId in data.panel) {
        const panel = data.panel[panelId];
        if (panel.name === 'Shoutouts for Streamers') {
            activePanel = panel;
        }
    }

    if (activePanel && activePanel.active === true) {
        await joinChannelDataById(channel_id);
    } else {
        await postFirebaseRequest('channels/remove', { channelId: channel_id }).catch(e => console.error(e));
    }

    await new Promise(resolve => setTimeout(resolve, delayMs));
    joinQueue.items.dequeue();
    joinQueue.isBusy = false;
    join();
}

async function joinChannelDataById(channel_id) {
    try {
        const user = await getUserById(channel_id);
        const joined = await client.join(user.name);
        console.log(`Join channel ${channel_id} ${user.display_name} ${joined[0]}`);
    } catch (error) {
        console.log(`FAILED Join channel ${channel_id}`);
    }
}

async function partChannelDataById(channel_id) {
    const user = await getUserById(channel_id);
    const parted = await client.part(user.name);
    console.log(`Part channel ${channel_id} ${user.display_name} ${parted[0]}`);
}

async function getUserById(channel_id) {
    const result = await fetch(`https://api.twitch.tv/kraken/users/${channel_id}`, {
        method: 'GET',
        headers: {
            'Accept': 'application/vnd.twitchtv.v5+json',
            'Client-ID': process.env.CLIENT_ID,
        }
    });
    const user = await result.json();
    return user;
}

