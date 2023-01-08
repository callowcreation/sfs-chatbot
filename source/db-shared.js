const fetch = require('node-fetch');
const environment = require('../environment');

const baseUrl = environment.isDevEnv()
? 'http://localhost:5000'
//: 'https://shoutouts-for-streamers.firebaseapp.com';
: 'https://shoutoutsdev-38a1d.firebaseapp.com';

const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Basic ' + (Buffer.from(process.env.EXT_CLIENT_ID + ':' + process.env.EXT_CLIENT_SECRET).toString('base64'))
};

function makeUrl(endpoint) {
    const path = `${baseUrl}/${endpoint}`;
    //console.log(`ENV_PATH_ENDPOINT------> ${path}`);
    return path;
}

async function getRequest(path) {
    return fetch(makeUrl(path), {
        method: 'GET',
        headers: headers
    });
}

async function postRequest(path, data) {
    return fetch(makeUrl(path), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(data)
    });
}

module.exports = {
    getRequest,
    postRequest
};