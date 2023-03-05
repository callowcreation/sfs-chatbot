"use strict";

const { getRequest, postRequest, putRequest } = require('./db-shared');

module.exports = {
    getChannels: () => getRequest('channels'),
    getBehaviours: (broadcaster_id) => getRequest(`settings/${broadcaster_id}/behaviours`),
    updateShoutout: (broadcaster_id, { is_auto, streamer_id, poster_id }) => putRequest(`shoutouts/${broadcaster_id}`, { is_auto, streamer_id, poster_id }),
    postSettings: (channelId) => postRequest('channels/settings', { channelId }),
    addShoutout: (channelId, { username, posted_by, is_auto, streamer_id, poster_id }) => postRequest('channels/shoutouts/add', { channelId, username, posted_by, is_auto, streamer_id, poster_id }),
    removeChannel: (channelId) => postRequest('channels/remove', { channelId }),
};