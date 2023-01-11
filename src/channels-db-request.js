"use strict";

const { getRequest, postRequest } = require('./db-shared');

module.exports = {
    getChannels: () => getRequest('channels/ids'),
    postSettings: (channelId) => postRequest('channels/settings', { channelId }),
    addShoutout: (channelId, { username, posted_by, is_auto }) => postRequest('channels/shoutouts/add', { channelId, username, posted_by, is_auto }),
    removeChannel: (channelId) => postRequest('channels/remove', { channelId })
};