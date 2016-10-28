"use strict";

var artistIDs = [];

var s, params, access_token, refresh_token, error;

var Authentication = {
    /**
     * Obtains parameters from the hash of the URL
     * @return Object
     */
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
            console.log("call to get schema finished. Requesting standard conenctions");
            $.getJSON("./standard_connections.json")
            .done(function(standard_connections_json) {
                console.log("finished getting standard connections");
                console.log("standardConnectionData is \n" + JSON.stringify(standard_connections_json));
                schemaCallback(scehma_json, standard_connections_json.connections);
            })
            .fail(function(jqxhr, textStatus, error) {
                var err = textStatus + ", " + error;
                console.log("Request Failed: " + err);
                tableau.abortWithError(err);
            });
        })
        .fail(function(jqxhr, textStatus, error) {
            var err = textStatus + ", " + error;
            console.log( "Request Failed: " + err );
            tableau.abortWithError(err);
        });
    }

    myConnector.getData = function(table, doneCallback) {
        console.log("getData called for table " + table.tableInfo.id);
        console.log("setting accessToken from tableau.password");
        var promise;    
        s = new SpotifyWebApi();
        s.setAccessToken(Authentication.getAccessToken());
        
        var offset = 0, limit = 50, i;
        var promises = [];
        
        var maxArtistIDs = 50;
        var artistIDsSlice = [];
        
        switch(table.tableInfo.id) {
            case "topArtists":
                promise = getMyTopArtistsPromise(table); 
                break;
            case "topTracks":
                promise = getMyTopTracksPromise(table);
                break;
            case "artists":
                for (i = 1; i <= artistIDs.length; i++) {
                    artistIDsSlice.push(artistIDs[i]);
                    
                    if ( (i % maxArtistIDs) == 0 || i == artistIDs.length)
                    promises.push(get<getMyArtistsPromise(table, artistIDsSlice));
                    offset+=limit;   
                }
                
                promise = Promise.all(promises);
                break;
            case "albums":
                for (i = 0; i < 3; i++) {
                    promises.push(getMyAlbumsPromise(table, offset, limit));
                    offset+=limit;   
                }
                
                promise = Promise.all(promises);
                break;
            case "tracks":
                for (i = 0; i < 3; i++) {
                    promises.push(getMyTracksPromise(table, offset, limit));
                    offset+=limit;   
                }
                
                promise = Promise.all(promises);
                break;
            default:
                console.error("Unknown table ID");
                break;
        }

        console.log("waiting on promises");
        promise.then(function(response) {
             console.log("promises have all finished! Done with this table");
             doneCallback();
         }, function(error) {
             console.log("Error occured waiting for promises. Aborting");
             tableau.abortWithError(error);
             console.error(error);
         });
    }

    tableau.registerConnector(myConnector);


    //-------------------------------API Requestors---------------------------

function runWithRetry(fn, actionDescription, retryCount) {
    retryCount = retryCount || 3;
    console.log("Running with retryCount of " + retryCount);

    function tryRunPromise() {
        return fn().then(function(data) { return Promise.resolve(data); }, function(err) {
            console.log("Error encountered. Current retryCount is = " + retryCount);
            if (retryCount > 0) {
                console.log("Trying again");
                retryCount--;
                return tryRunPromise();
            } else {
                console.error("Out of retries, failing the call");
                tableau.abortWithError("Unable to perform '" + actionDescription + "'");
                Promise.reject(err);
            }
        });
    };

    return tryRunPromise();
}

function makeRequestAndProcessRows(description, fn, rowProcessor) {
    console.log("Making request for " + description);
    return new Promise(function(resolve, reject) {
         return runWithRetry(fn, description).then(function(data) {
             var toRet = [];
             console.log("Received Results for " + description + ". Number of rows: " + data.items.length);
             _.each(data.items, function(item) {
                 toRet.push(rowProcessor(item));
            });

            resolve(toRet);
         });
    });
}
        
    function getMyTopArtistsPromise(table) {
        return makeRequestAndProcessRows(
            "getMyTopArtists", 
            s.getMyTopArtists.bind(undefined, {time_range: tableau.connectionData}), 
            function(artist) {
                console.log("Processing item " + artist.name);              
                return {
                    "followers": artist.followers ? artist.followers.total : 0,
                    "genre1": artist.genres[0] || null,
                    "genre2": artist.genres[1] || null,
                    "href": artist.href,
                    "id": artist.id,
                    "image_link":artist.images[0] ? artist.images[0].url : null,
                    "name": artist.name,
                    "popularity":artist.popularity,
                    "uri": artist.uri
                };
            }).then(function(toRet) {
                table.appendRows(toRet);
                Promise.resolve();
            });
    }

    function getMyTopTracksPromise(table) { 
        return makeRequestAndProcessRows(
            "getMyTopTracks", 
            s.getMyTopTracks.bind(undefined, {time_range: tableau.connectionData}), 
            function(track) {
                console.log("Processing track " + track.name);              
                return {
                    "album_id": track.album.id,
                    "artist_id": track.artists[0].id,
                    "artist_name": track.artists[0].name,
                    "duration_ms": track.duration_ms,
                    "explicit": track.explicit,
                    "href": track.href,
                    "id": track.id,
                    "name": track.name,
                    "preview_url": track.preview_url,
                    "track_number": track.track_number,
                    "uri": track.uri
                };
            }).then(function(toRet) {
                table.appendRows(toRet);
                Promise.resolve();
            });
    }
    
    function getMyArtistsPromise(table, ids) { 
        return new Promise(function(resolve, reject) {
            var toRet = [];
            var entry = [];
            
            var promise = getRelatedArtistsPromise();
            
            promise.then(function(response) {
                s.getArtists(ids).then(function(data) {                
                    _.each(data.artists, function(artist) {
                        entry = {
                            "followers": artist.followers ? artist.followers.total : 0,
                            "genre1": artist.genres[0] || null,
                            "genre2": artist.genres[1] || null,
                            "href": artist.href,
                            "id": artist.id,
                            "image_link": artist.images[0] ? artist.images[0].url : null,
                            "name": artist.name,
                            "popularity":artist.popularity,
                            "related_artist1_id": response[0] || null,
                            "related_artist2_id":  response[1] || null,
                            "related_artist3_id":  response[2] || null,
                            "uri": artist.uri                        
                        };

                        toRet.push(entry)
                    });

                    table.appendRows(toRet);
                    resolve();

                }, function(err) {
                    console.error(err);
                    Promise.reject(err);
                });
            }, function(error) {
                console.error(error);
            });
        });
    }
    
    function getMyAlbumsPromise(table, offset, limit) {
        return new Promise(function(resolve, reject) {
            var toRet = [];
            var entry = [];

            s.getMySavedAlbums({limit: limit, offset: offset}).then(function(data) {               
                _.each(data.items, function(albumObject) {
                    entry = {
                        "added_at": albumObject.added_at,
                        "artist_id": albumObject.album.artists[0].id,
                        "genre1": albumObject.album.genres[0] || null,
                        "genre2": albumObject.album.genres[1] || null,
                        "href": albumObject.album.href,
                        "id": albumObject.album.id,
                        "image_link": albumObject.album.images[0] ? albumObject.album.images[0].url : null,
                        "name": albumObject.album.name,
                        "popularity": albumObject.album.popularity,
                        "release_date": albumObject.album.release_date,
                        "type": albumObject.album.type,
                        "uri": albumObject.album.uri
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
    
    function getMyTracksPromise(table, offset, limit) {
        return new Promise(function(resolve, reject) {
            var toRet = [];
            var entry = [];

            s.getMySavedTracks({limit: limit, offset: offset}).then(function(data) {               
                var featurePromise = getTrackFeaturesPromise(data.items, offset, limit);
                
                featurePromise.then(function(response) {                    
                    _.each(data.items, function(trackObject, index) {
                        entry = {
                            "added_at": trackObject.added_at,
                            "album_id": trackObject.track.album.id,
                            "artist_id": trackObject.track.artists[0].id,
                            "artist_name": trackObject.track.artists[0].name,
                            "duration_ms": trackObject.track.duration_ms,
                            "explicit": trackObject.track.explicit,
                            "href": trackObject.track.href,
                            "id": trackObject.track.id,
                            "name": trackObject.track.name,
                            "preview_url": trackObject.track.preview_url,
                            "track_number": trackObject.track.track_number,
                            "uri": trackObject.track.uri,
                            "danceability": response.audio_features[index].danceability,
                            "energy": response.audio_features[index].energy,
                            "key": response.audio_features[index].key,
                            "loudness": response.audio_features[index].loudness,
                            "mode": response.audio_features[index].mode,
                            "speechiness": response.audio_features[index].speechiness,
                            "acousticness": response.audio_features[index].acousticness,
                            "instrumentalness": response.audio_features[index].instrumentalness,
                            "liveness": response.audio_features[index].liveness,
                            "valence": response.audio_features[index].valence,
                            "tempo": response.audio_features[index].tempo,
                            "time_signature": response.audio_features[index].time_signature
                        };

                        toRet.push(entry)
                        artistIDs.push(trackObject.track.artists[0].id);
                    });
                    
                    
                    table.appendRows(toRet);
                    resolve();
                }, function(error) {
                    console.error(error);
                });
            }, function(err) {
                console.error(err);
                Promise.reject(err);
            });
        });   
    }
    
    function getTrackFeaturesPromise(items, limit, offset) {
        var ids = [];
        _.each(items, function(trackObject) {
           ids.push(trackObject.track.id); 
        });
        return new Promise(function(resolve, reject) {
            s.getAudioFeaturesForTracks(ids).then(function(data) {               
                resolve(data);
            }, function(err) {
                console.error(err);
                Promise.reject(err);
            });
        });         
    }
    
    function getRelatedArtistsPromise() { 
        return new Promise(function(resolve, reject) {
            var toRet = [];
            var i = 0;

            s.getArtistRelatedArtists(artistIDs[0]).then(function(data) {               
                for (i = 0; i < 3; i++) {
                    if (data.artists[i]) {
                        toRet.push(data.artists[i].id);
                    }
                }
                
                resolve(toRet);

            }, function(err) {
                console.error(err);
                Promise.reject(err);
            });
        });
    }
    
    function getArtistsAlbumsPromise() { 
        return new Promise(function(resolve, reject) {
            var toRet = [];
            var i = 0;

            s.getArtistRelatedArtists(artistIDs[0]).then(function(data) {               
                for (i = 0; i < 3; i++) {
                    if (data.artists[i]) {
                        toRet.push(data.artists[i].id);
                    }
                }
                
                resolve(toRet);

            }, function(err) {
                console.error(err);
                Promise.reject(err);
            });
        });
    } 
   +
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
