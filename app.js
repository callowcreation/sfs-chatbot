"use strict";

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');

const { Queue } = require('./queue');
const chatInterface = require('./source/chat-interface');
const { verifyJwt, signJwt, writeJwt, readJwt } = require('./source/tokens-db-request');
const { getChannels, removeChannel } = require('./source/channels-db-request');
const twitchRequest = require('./source/twitch-request');
const environment = require('./environment');

const OWNER_ID = '75987197';
const CHANNEL_ID = OWNER_ID;//'101223367' // <--- 101223367 is woLLac;

const delayMs = 150;
const joinQueue = {
    items: new Queue(),
    isBusy: false
};

const app = express();
app.use(bodyParser.json());

if (module === require.main) {
    chatInterface.connect();
    chatInterface.listen();

    app.get('/', (req, res) => {
        res.status(200).send(`<a href="/authorize">Authorize</a>`);
    });

    app.get('/test', (req, res) => {
        twitchRequest.getUserExtensions(CHANNEL_ID).then(json => res.status(200).json(json))
            .catch(e => console.error(e));
    });

    app.get('/home', async (req, res) => {
        res.status(200).send(`<a href="/test">Test</a>`);
    });

    app.post('/join', async (req, res) => {
        if (verifyAuthorization(req)) {
            try {
                const { data: [user] } = await twitchRequest.getUserById(req.body.channelId);
                await chatInterface.joinChannel(user);
                res.json({ message: `Joining channel: ${user.login} ${user.id}` });
            } catch (err) {
                const message = `Joining channel: ${req.body.channelId} FAILED`;
                console.log(message);
                console.error(err);
                res.status(500).json({ message });
            }
        } else {
            res.status(404).end();
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
            const validate = await twitchRequest.validateToken();
            console.log({ validate });

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

    app.get('/authorize', async (req, res) => {
        if (autoAuthorized()) {
            res.redirect('/home');
        } else {
            res.redirect(twitchRequest.authorizeUrl);
        }
    });

    app.get('/auth-callback', async (req, res) => {
        const code = req.query['code'];
        const state = req.query['state'];

        try {
            await twitchRequest.authorize(code, state);

            const payload = twitchRequest.getAuthenticated();
            const jwt_token = signJwt(payload);
            await writeJwt({ jwt_token });

            console.log('authenticated');

            await getAndJoinChannels();

            res.redirect('/home');
            
        } catch (error) {
            console.error(error);
            res.redirect('/failed');
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

        await autoAuthorized();
    });
}

async function autoAuthorized() {
    try {
        const { jwt_token } = await readJwt();
        const payload = verifyJwt(jwt_token);
        const isValidated = await twitchRequest.validate(payload.access_token);

        if (isValidated) {
            twitchRequest.setAuthenticated(payload);
            await getAndJoinChannels();
            return true;
        }
    } catch (error) {
        console.error(error);
    }
    return false;
}

async function getAndJoinChannels() {
    const json = await getChannels().then(r => r.json());
    //const ids = json.ids;
    const ids = ['75987197'];
    /*ids.length = 10;*/
    /*const validate = await twitchRequest.validateToken();
    console.log({ validate });
    
    const revoke = await twitchRequest.revokeToken();
    console.log({ revoke });

    const validateAgain = await twitchRequest.validateToken();
    console.log({ validateAgain });*/
    const requester = async (chunk) => {
        return twitchRequest.getUsers(chunk.map(x => `id=${x}`));
    };
    const mapper = x => ({ id: x.id, login: x.login });

    const users = await chunkRequests(ids, requester, mapper);

    console.log(users);

    for (let i = 0; i < users.length; i++) {
        joinQueue.items.enqueue(users[i]);
        if (i === 0)
            join();
    }
    join();
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

const userExtensions = {};

async function join() {
    if (joinQueue.items.size() === 0) return;
    if (joinQueue.isBusy === true) return;
    joinQueue.isBusy = true;

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
    }
    joinQueue.isBusy = false;
    join();
}

