"use strict";

var artistIDs;

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
        } else {
            toggleUIState(true);
        }

        if  (tableau.phase == tableau.phaseEnum.interactivePhase || tableau.phase == tableau.phaseEnum.authPhase) {
            tableau.password = access_token;
        }
      
        initCallback();
    };

    myConnector.getSchema = function(schemaCallback) {
        $.getJSON( "./schema.json" )
        .done(function(scehma_json) {
            $.getJSON("./standard_connections.json")
            .done(function(standard_connections_json) {
                schemaCallback(scehma_json, standard_connections_json.connections);
            })
            .fail(function(jqxhr, textStatus, error) {
                var err = textStatus + ", " + error;
                console.log("Request Failed: " + err);
            });
        })
        .fail(function(jqxhr, textStatus, error) {
            var err = textStatus + ", " + error;
            console.log( "Request Failed: " + err );
        });
    }

    myConnector.getData = function(table, doneCallback) {        
        var promise;
        s.setAccessToken(tableau.password); 
        
        var offset = 0, limit = 50, i;
        var promises = [];
        
        var maxArtistIDs = 50;
        var artistIDsSlice = [], artistIDsArray = [];
        
        switch(table.tableInfo.id) {
            case "topArtists":
                promise = getMyTopArtistsPromise(table); 
                break;
            case "topTracks":
                promise = getMyTopTracksPromise(table);
                break;
            case "artists":
                artistIDsArray = Array.from(artistIDs);

                for (i = 0; i < artistIDs.size; i++) {
                    artistIDsSlice.push(artistIDsArray[i]);
                    
                    var entryNumber = i+1;
                    if ( (entryNumber % maxArtistIDs) == 0 || entryNumber == artistIDs.size) {
                        promises.push(getMyArtistsPromise(table, artistIDsSlice));
                        artistIDsSlice = [];
                    }

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

        promise.then(function(response) {
             doneCallback();
         }, function(error) {
             tableau.abortWithError(error);
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
                _.each(data.items, function(artist) {                   
                    entry = {
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
                _.each(data.items, function(track) {
                    entry = {
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
    
    function getMyArtistsPromise(table, ids) { 
        return new Promise(function(resolve, reject) {
            var toRet = [];
            var entry = [];
                        
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
        artistIDs = new Set();

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
                        artistIDs.add(trackObject.track.artists[0].id);
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
