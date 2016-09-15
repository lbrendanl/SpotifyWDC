// Define our Web Data Connector
(function() {
    var $ = require('jquery');
    var _ = require('underscore');
    var Spotify = require('spotify-web-api-js');
    
    var s = new Spotify(),
        params = getHashParams();
        access_token = params.access_token,
        refresh_token = params.refresh_token,
        error = params.error;

    if (error) {
        alert('There was an error during the authentication');
    } else {
        if (access_token) {
            console.log("logged in");
        } else {
            console.log("not logged in");
        }
    }

    var myConnector = tableau.makeConnector();

    myConnector.getSchema = function(schemaCallback) {

    }

    myConnector.getData = function(table, doneCallback) {

    }

    tableau.registerConnector(myConnector);
})();



//--------------------------------HELPERS---------------------------------

/**
 * Obtains parameters from the hash of the URL
 * @return Object
 */
function getHashParams() {
    var hashParams = {};
    var e, r = /([^&;=]+)=?([^&;]*)/g,
        q = window.location.hash.substring(1);
    while (e = r.exec(q)) {
        hashParams[e[1]] = decodeURIComponent(e[2]);
    }
    return hashParams;
}

// Note: Refresh tokens are valid forever, just need to get a new access token.
// Refresh tokens can me manually revoked but won't expire
function refreshToken() {
    $.ajax({
        url: '/refresh_token',
        data: {
            'refresh_token': refresh_token
        }
    }).done(function(data) {
        access_token = data.access_token;
    });
}

// Helper function that loads a json and a callback to call once that file is loaded
function loadJSON(path, cb, isLocal) {
    var obj = new XMLHttpRequest();
    obj.overrideMimeType("application/json");
    if (isLocal) {
        obj.open("GET", "../json/" + path + ".json", true);
    } else {
        obj.open("GET", "https://crossorigin.me/http://jsonplaceholder.typicode.com/" + path, true);
    }
    obj.onreadystatechange = function() {
        if (obj.readyState == 4 && obj.status == "200") {
            cb(obj.responseText);
        }
    }
    obj.send(null);
}