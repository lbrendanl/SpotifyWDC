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
        
        if (error) {
            console.error("There was an error during the authentication");
        }

        if (!access_token) {
            if (tableau.phase != tableau.phaseEnum.gatherDataPhase) {
                window.location.href = "/login"
            }
        }

        if  (tableau.phase == tableau.phaseEnum.interactivePhase || tableau.phase == tableau.phaseEnum.authPhase) {
            tableau.password = access_token;
        }
      
        initCallback();
    };

    myConnector.getSchema = function(schemaCallback) {
        $.getJSON( "./schema.json" )
        .done(function( schemaJson ) {
            schemaCallback(schemaJson);
        })
        .fail(function( jqxhr, textStatus, error ) {
            var err = textStatus + ", " + error;
            console.log( "Request Failed: " + err );
        });
    }

    myConnector.getData = function(table, doneCallback) {        
        var promise;
        s.setAccessToken(tableau.password); 
        
        switch(table.tableInfo.id) {
            case "topArtists":
                promise = getMyTopArtistsPromise(table); 
                break;
            case "topTracks":
                promise = getMyTopTracksPromise(table);
                break;
            default:
                console.err("Invalid ID");
                break;
        }

        promise.then(function(response) {
             doneCallback();
         }, function(error) {
             console.error(error);
         });
    }

    tableau.registerConnector(myConnector);


    //-------------------------------API Requestors---------------------------
        
    function getMyTopArtistsPromise(table) { 
        return new Promise(function(resolve, reject) {
            var toRet = [];
            var entry = [];

            s.getMyTopArtists({time_range: tableau.connectionData}).then(function(data) {
                console.log("top artists: ", data);
                
                _.each(data.items, function(artist) {
                    var imageUrl = "";
                    var followersTotal = 0;

                    if (artist.images[0]) {
                        imageUrl = artist.images[0].url
                    }

                    if (artist.followers) {
                        followersTotal = artist.followers.total;
                    }
                    
                    entry = {
                        "name": artist.name,
                        "uri": artist.uri,
                        "popularity": artist.popularity,
                        "id": artist.id,
                        "href": artist.href,
                        "followers": followersTotal,
                        "image_link": imageUrl
                    };

                    toRet.push(entry)
                });

                table.appendRows(toRet);
                resolve();

            }, function(err) {
                console.error(err);
                Promise.reject(err);
            });
        });
    }

    function getMyTopTracksPromise(table) { 
        return new Promise(function(resolve, reject) {
            var toRet = [];
            var entry = [];

            s.getMyTopTracks({time_range: tableau.connectionData}).then(function(data) {
                console.log("top tracks: ", data);
                
                _.each(data.items, function(track) {
                    var imageUrl = "";
                    var followersTotal = 0;

                    if (track.album.images[0]) {
                        imageUrl = track.album.images[0].url
                    }
                    
                    entry = {
                        "album_type": track.album.album_type,
                        "album_href": track.album.href,
                        "album_id": track.album.id,
                        "album_image_link": imageUrl,
                        "album_name": track.album.name,
                        "album_uri": track.album.uri,
                        "artist_id": track.artists[0].id,
                        "artist_name": track.artists[0].name,
                        "track_number": track.track_number,
                        "duration_ms": track.duration_ms,
                        "is_explicit": track.explicit,
                        "href": track.href,
                        "uri": track.uri,
                        "id": track.id,
                        "preview_url": track.preview_url
                    };

                    toRet.push(entry)
                });

                table.appendRows(toRet);
                resolve();

            }, function(err) {
                console.error(err);
                Promise.reject(err);
            });
        });
    }

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
        tableau.connectionData = document.querySelector('input[name="term"]:checked').value;
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
