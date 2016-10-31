"use strict";

var spotifyRequestor;

var Authentication = {
     // Obtains parameters from the hash of the URL
    _getHashParams : function getHashParams() {
        var hashParams = {};
        var e, r = /([^&;=]+)=?([^&;]*)/g,
            q = window.location.hash.substring(1);
        while (e = r.exec(q)) {
            hashParams[e[1]] = decodeURIComponent(e[2]);
        }
        return hashParams;
    },

    hasTokens : function() {
        var result = Authentication.getTokens();
        return !!result.access_token && !!result.refresh_token;
    },

    getTokens : function() {
        var result = {};

        // We've saved off the access & refresh token to tableau.password
        if (tableau.password) {
            result = JSON.parse(tableau.password);
        } else {
            result = Authentication._getHashParams();
        }

        return result;
    },

    getAccessToken : function() {
        return Authentication.getTokens().access_token;
    },

    // Note: Refresh tokens are valid forever, just need to get a new access token.
    // Refresh tokens can me manually revoked but won"t expire
    refreshToken: function(doneHandler) {
        return $.ajax({
            url: "/refresh_token",
            data: {
                "refresh_token": refresh_token
            }
        }).done(function(data) {
            doneHandler(data.access_token);
        });
    }
};

// Define our Web Data Connector
(function() {
    var myConnector = tableau.makeConnector();

    myConnector.init = function(initCallback){
        console.log("Initializing Web Data Connector. Phase is " + tableau.phase);

        if (!Authentication.hasTokens()) {
            console.log("We do not have authentication tokens available");
            if (tableau.phase != tableau.phaseEnum.gatherDataPhase) {
                console.log("Redirecting to login page");
                window.location.href = "/login";
            } else {
                tableau.abortForAuth("Missing authentication!");
            }

            // Early return here to avoid changing any other state
            return;
        }

        console.log("Access token found!");
        toggleUIState(true);

        console.log("Setting tableau.password to access_token and refresh tokens");
        tableau.password = JSON.stringify(Authentication.getTokens());

        var s = new SpotifyWebApi();
        s.setAccessToken(Authentication.getAccessToken());
        spotifyRequestor = new SpotifyRequestor(s, tableau.connectionData);
        
        console.log("Calling initCallback");
        initCallback();

        if (tableau.phase === tableau.phaseEnum.authPhase) {
            // Immediately submit if we are running in the auth phase
            tableau.submit();
        }
    };

    myConnector.getSchema = function(schemaCallback) {
        console.log("getSchema called. Making request to ./schema.json");
        $.getJSON( "./schema.json" )
        .done(function(scehma_json) {
            console.log("call to get schema finished");
            schemaCallback(scehma_json.tables, scehma_json.standardConnections);
        })
        .fail(function(jqxhr, textStatus, error) {
            var err = textStatus + ", " + error;
            console.log("Request Failed: " + err);
            tableau.abortWithError(err);
        });
    }

    myConnector.getData = function(table, doneCallback) {
        console.log("getData called for table " + table.tableInfo.id);
        var tableFunctions = {
            "topArtists": spotifyRequestor.getMyTopArtists.bind(spotifyRequestor),
            "topTracks": spotifyRequestor.getMyTopTracks.bind(spotifyRequestor),
            "artists": spotifyRequestor.getMySavedArtists.bind(spotifyRequestor),
            "albums": spotifyRequestor.getMySavedAlbums.bind(spotifyRequestor),
            "tracks": spotifyRequestor.getMySavedTracks.bind(spotifyRequestor)
        };

        if (!tableFunctions.hasOwnProperty(table.tableInfo.id)) {
            tableau.abortWithError("Unknown table ID: " + table.tableInfo.id);
            return;
        }

        tableFunctions[table.tableInfo.id]().then(function(rows) {
            table.appendRows(rows);
            doneCallback();
        }, function(error) {
             console.log("Error occured waiting for promises. Aborting");
             tableau.abortWithError(error.toString());
             doneCallback();
         });
    }

    tableau.registerConnector(myConnector);


    //-------------------------------Connector UI---------------------------//

    $(document).ready(function() {  
        $("#getdata").click(function() { // This event fires when a button is clicked
            setupConnector();
        });
    });

    function setupConnector() {
        tableau.connectionName = "Spotify Connector";
        tableau.connectionData = document.querySelector('input[name="term"]:checked').value;
        tableau.submit();
    };
    
    function toggleUIState(showContent) {
        if (showContent) {
            $('#spinner').css('display', 'none');
            $('#content').css('display', 'inline-block');
        } else {
            $('#spinner').css('display', 'inline-block');
            $('#content').css('display', 'none');
        }
    }
})();
