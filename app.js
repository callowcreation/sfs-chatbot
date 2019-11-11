require('dotenv').config();

const express = require('express');
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

const serviceAccount = {
    "type": process.env.SERVICE_ACCOUNT_TYPE,
    "project_id": process.env.SERVICE_ACCOUNT_PROJECT_ID,
    "private_key_id": process.env.SERVICE_ACCOUNT_PRIVATE_KEY_ID,
    "private_key": process.env.SERVICE_ACCOUNT_PRIVATE_KEY,
    "client_email": process.env.SERVICE_ACCOUNT_CLIENT_EMAIL,
    "client_id": process.env.SERVICE_ACCOUNT_CLIENT_ID,
    "auth_uri": process.env.SERVICE_ACCOUNT_AUTH_URI,
    "token_uri": process.env.SERVICE_ACCOUNT_TOKEN_URI,
    "auth_provider_x509_cert_url": process.env.SERVICE_ACCOUNT_AUTH_PROVIDER_X509_CERT_URL,
    "client_x509_cert_url": process.env.SERVICE_ACCOUNT_CLIENT_X509_CERT_URL
};

const MAX_CHANNEL_SHOUTOUTS = 4;

const firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://shoutouts-for-streamers.firebaseio.com"
});

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
            twitchOAuth.fetchToken(code).then(json => {
                if (json.success === true) {
                    console.log('authenticated');
                    res.redirect('/home');

                    const rootRef = firebaseApp.database().ref('/');

                    rootRef.on('child_added', async snapshot => {
                        joinQueue.items.enqueue(snapshot.key);
                        join();
                    });
                    rootRef.on('child_removed', async snapshot => {
                        await partChannelDataById(snapshot.key);
                    });

                } else {
                    res.redirect('/failed');
                }
            });
        } else {
            res.redirect('/failed');
        }

    });

    const server = app.listen(process.env.PORT || 7000, () => {
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
            const { data } = await twitchOAuth.getEndpoint(url);

            let activePanel = null;

            for (const panelId in data.panel) {
                const panel = data.panel[panelId];
                if (panel.name === 'Shoutouts for Streamers') {
                    activePanel = panel;
                }
            }

            if (activePanel && activePanel.active === true) {

                const username = getUsername(term, msg);

                const ref = firebaseApp.database().ref(`${user['room-id']}/shoutouts`);
                const snap = await ref.once('value');
                const values = snap.val();
                for (const channel_id in values) {
                    if (values[channel_id].toLowerCase() === username) {
                        await ref.child(channel_id).remove();
                        console.log(`${channel} : Removed Dup : ${username}`);
                    }
                }

                await ref.push(username);
                console.log(`${channel} : Added : ${username}`);

                const snapshot = await ref.once('value');
                const numChildren = snapshot.numChildren();
                if (numChildren > MAX_CHANNEL_SHOUTOUTS) {
                    const firstsnap = await ref.limitToFirst(1).once('value');
                    firstsnap.forEach(async csnap => {
                        const uname = csnap.val();
                        await ref.child(csnap.key).remove();
                        console.log(`${channel} : Removed Max : ${uname}`);
                    });
                }

                const update = await fetch('https://shoutouts-for-streamers.firebaseapp.com/channels/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ channelId: user['room-id'] })
                });
                console.log(`${channel} : Update Status ${update.status}`);
            } else {
                const ref = firebaseApp.database().ref(`${user['room-id']}`);
                await ref.remove();
                console.log(`${channel} : Not Active`);
            }
        } catch (error) {
            console.log(error);
        }
    }
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
        const ref = firebaseApp.database().ref(`${channel_id}`);
        await ref.remove();
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

