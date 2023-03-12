"use strict";

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');

const { Queue } = require('./queue');
const chatInterface = require('./src/chat-interface');
const { getChannels, removeChannel } = require('./src/channels-db-request');
const twitchRequest = require('./src/twitch-request');
const environment = require('./environment');

const OWNER_ID = '75987197';
const CHANNEL_ID = OWNER_ID;//'101223367' // <--- 101223367 is woLLac;

const delayMs = 150;
const joinQueue = {
    items: new Queue(),
    isBusy: false,
    initialized: false
};
const userExtensions = {};
const joined = [];

const app = express();
app.use(bodyParser.json());

if (module === require.main) {

    twitchRequest.twitchOAuth.token()
        .then(async () => {
            chatInterface.connect();
            chatInterface.listen();
            await initialJoinChannels();
        });

    app.get('/', (req, res) => {
        res.status(200).send(`<a href="/health">Health Check</a>`);
    });

    app.get('/health', (req, res) => {
        twitchRequest.getUserExtensions(CHANNEL_ID).then(json => res.status(200).json(json))
            .catch(e => console.error(e));
    });

    app.get('/user/name/:name', (req, res) => {
        twitchRequest.getUserByName(req.params.name).then(json => res.status(200).json(json))
            .catch(e => console.error(e));
    });

    app.get('/user/id/:id', (req, res) => {
        twitchRequest.getUserById(req.params.id).then(json => res.status(200).json(json))
            .catch(e => console.error(e));
    });

    app.post('/join', async (req, res) => {
        if (verifyAuthorization(req)) {
            try {
                if (joinQueue.initialized) {
                    await joinChannelsById([req.body.channelId]);
                } else {
                    await initialJoinChannels();
                }
                res.json({ message: `Joining channel: ${req.body.channelId}` });
            } catch (err) {
                const message = `Joining channel: ${req.body.channelId} FAILED`;
                console.log(message);
                console.error(err);
                res.status(500).json({ message });
            }
        } else {
            res.status(401).end();
        }
    });

    app.post('/users', async (req, res) => {
        const users = req.body.users;
        twitchRequest.getUsers(users)
            .then(json => {
                res.status(200).json(json);
            }).catch(e => {
                console.error(e);
                res.status(500).send(JSON.stringify(e));
            });
    });

    app.post('/ping', async (req, res) => {
        if (verifyAuthorization(req)) {
            twitchRequest.getUserExtensions(OWNER_ID).then(json => {
                res.status(200).json(json);
            }).catch(e => {
                console.error(e);
                res.status(500).send(JSON.stringify(e));
            });
        } else {
            res.status(401).json({ reason: 'Unauthorized' });
        }
    });

    if (environment.isDevEnv()) {
        console.log('Playground with caution DEV ENV');
    } else {
        console.log('No Joke PROD CAUTION ENV');
    }

    const server = app.listen(environment.port() || 7000, async () => {
        const port = server.address().port;
        console.log(`App listening on port ${port}`);

        // await autoAuthorized();
    });
}


async function twitchUsers(ids) {

    const requester = async (chunk) => twitchRequest.getUsers(chunk.map(x => `id=${x}`));
    const mapper = x => ({ id: x.id, login: x.login });

    return chunkRequests(ids, requester, mapper);
}

async function joinChannelsById(ids) {
    const users = await twitchUsers(ids);
    console.log(users);

    for (let i = 0; i < users.length; i++) {
        joinQueue.items.enqueue(users[i]);
        if (i === 0)
            join();
    }
    join();
}

async function initialJoinChannels() {
    try {
        const json = await getChannels().then(r => r.json());
        //const ids = json.ids;
        const ids = ['75987197'];
        /*ids.length = 10;*/
        await joinChannelsById(ids);
    } catch (err) {
        console.error(err);
    }
}

async function chunkRequests(stack, requester, mapper) {
    const promises = [];
    while (stack.length > 0) {
        const chunk = stack.splice(0, 100);
        const promise = requester(chunk)
            .then(res => {
                if (res.data && res.data.length > 0) {
                    return res.data.map(mapper);
                } else {
                    return [];
                }
            })
            .catch(e => console.error({ e, timestamp: new Date().toLocaleTimeString() }));
        promises.push(promise);
    }
    const resolved = await Promise.all(promises);
    const results = [].concat.apply([], resolved);
    return results;
}

function verifyAuthorization(req) {
    return req.headers['authorization'] === 'Basic ' + (Buffer.from(process.env.EXT_CLIENT_ID + ':' + process.env.EXT_CLIENT_SECRET).toString('base64'));
}

async function join() {
    if (joinQueue.items.size() === 0) return;
    if (joinQueue.isBusy === true) return;
    joinQueue.isBusy = true;
    joinQueue.initialized = true;

    const { id, login } = joinQueue.items.peek();

    if (!Object.keys(userExtensions).includes(id)) {
        const response = await twitchRequest.getUserExtensions(id);
        userExtensions[id] = response;
    }

    let activePanel = null;
    let joinResult = 0;
    if (userExtensions[id].data) {
        for (const panelId in userExtensions[id].data.panel) {
            const panel = userExtensions[id].data.panel[panelId];
            if (panel.name === 'Shoutouts for Streamers') {
                activePanel = panel;
            }
        }

        if (activePanel && activePanel.active === true) {
            joinResult = await chatInterface.joinChannel({ id, login });
        } else {
            joinQueue.items.dequeue();
            console.log(`Panel not active for ${id} dequeuing`);
        }

    } else {
        console.error(userExtensions[id]);
    }

    await new Promise(resolve => setTimeout(resolve, delayMs));
    if (joinResult === -1) {
        await removeChannel(id);
    }
    if (joinResult === 1 || joinResult === -1) {
        joinQueue.items.dequeue();
        joined.push({ login, result: joinResult });
    }
    joinQueue.isBusy = false;
    join();
}

