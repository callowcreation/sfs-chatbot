"use strict";

const tmi = require('tmi.js');
const dbRequest = require('./db-request');
const twitchRequest = require('./twitch-request');

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
    try {
        const user = await twitchRequest.getUserById(channel_id);
        const joined = await client.join(user.name);
        console.log(`Join channel ${channel_id} ${user.display_name} ${joined[0]}`);
    } catch (error) {
        console.log(`FAILED Join channel ${channel_id}`);
        console.error(error);
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

    const term = '!so ';
    if (msg.indexOf(term) === 0) {
        try {
            const { data } = await twitchRequest.getUserExtensions(user['room-id']);

            let activePanel = null;

            for (const panelId in data.panel) {
                const panel = data.panel[panelId];
                if (panel.name === 'Shoutouts for Streamers') {
                    activePanel = panel;
                }
            }

            if (activePanel && activePanel.active === true) {

                const username = chatInterface.getUsername(term, msg);

                const twitchUsers = await twitchRequest.getUserByName(username);

                if (twitchUsers.data.length === 1) {
                    const result_add = await dbRequest.addShoutout(user['room-id'], username);
                    console.log(`${channel} ${user['room-id']} : Add ${username} : Status ${result_add.status}`);
                }

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
    getUsername,
    joinChannel: joinChannelById
};