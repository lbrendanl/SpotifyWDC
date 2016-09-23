"use strict";

var s, params, access_token, refresh_token, error;;

// Define our Web Data Connector
(function() {
    var myConnector = tableau.makeConnector();

    myConnector.init = function(initCallback){
        s = new SpotifyWebApi();
        params = getHashParams();
        
        access_token = params.access_token,
        refresh_token = params.refresh_token,
        error = params.error;
        
        console.log("Platform Version: " + tableau.platformVersion);

        if (error) {
            console.error("There was an error during the authentication");
        } else {

        }

        if  (tableau.phase == tableau.phaseEnum.interactivePhase || tableau.phase == tableau.phaseEnum.authPhase) {
            tableau.password = access_token;
        }

        initCallback();
    };

    myConnector.getSchema = function(schemaCallback) {
        $.getJSON("./schema.json", function(schemaJson) {
            schemaCallback(schemaJson);
        });
    }

    myConnector.getData = function(table, doneCallback) {
        s.setAccessToken(tableau.password);
        
        s.getUserPlaylists()  // note that we don't pass a user id
        .then(function(data) {
            console.log('User playlists', data);
        }, function(err) {
            console.error(err);
        });

        s.getMyTopArtists().then(function(data) {
            console.log("top tracks: ", data);
        }, function(err) {
            console.error(err);
        });
    }

    tableau.registerConnector(myConnector);

    //--------------------------------HELPERS---------------------------------

    $(document).ready(function() {
        $("#getdata").click(function() { // This event fires when a button is clicked
            setupConnector();
        });
    });

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


    function setupConnector() {
        tableau.connectionName = "Spotify Connector";
        tableau.submit();
    };

    // Note: Refresh tokens are valid forever, just need to get a new access token.
    // Refresh tokens can me manually revoked but won"t expire
    function refreshToken() {
        $.ajax({
            url: "/refresh_token",
            data: {
                "refresh_token": refresh_token
            }
        }).done(function(data) {
            access_token = data.access_token;
        });
    }
})();
