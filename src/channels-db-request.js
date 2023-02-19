"use strict";

const { getRequest, postRequest } = require('./db-shared');

module.exports = {
    getChannels: () => getRequest('channels/ids'),
    postSettings: (channelId) => postRequest('channels/settings', { channelId }),
    addShoutout: (channelId, { username, posted_by, is_auto, streamer_id, poster_id }) => postRequest('channels/shoutouts/add', { channelId, username, posted_by, is_auto, streamer_id, poster_id }),
    removeChannel: (channelId) => postRequest('channels/remove', { channelId }),
    getBehaviours: (channelId) => getRequest(`v3/channels/behaviours/${channelId}`),
};