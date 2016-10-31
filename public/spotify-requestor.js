function SpotifyRequestor(spotifyApi, timeRange, reportProgress) {
  this.s = spotifyApi;
  this.timeRange = timeRange;
  this.defaultPageSize = 50;
  this.maxResults = 1000;
  this.reportProgress = reportProgress || function() {};
}


SpotifyRequestor.prototype._runWithRetry = function(fn, actionDescription, retryCount) {
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

SpotifyRequestor.prototype._makeRequestAndProcessRows = function(description, fn, rowProcessor, rowAccessor) {
    console.log("Making request for " + description);
    rowAccessor = rowAccessor || function(data) { return data.items; };
    return new Promise(function(resolve, reject) {
         return this._runWithRetry(fn, description).then(function(data) {
             console.log("Received Results for " + description + ". Number of rows: " + rowAccessor(data).length);
             var toRet = rowAccessor(data).map(rowProcessor);

            // Send back some paging information to the caller
            var paging = {
                offset : data.offset || 0,
                total : data.total || 0
            };

            resolve({rows: toRet, paging: paging});
         });
    }.bind(this));
}

SpotifyRequestor.prototype._makeRequestAndProcessRowsWithPaging = function(description, fn, rowProcessor, rowAccessor) {
    var allRows = [];
    var getPage = function(limit, offset) {
        return this._makeRequestAndProcessRows(
        description, 
        fn.bind(this, {limit: limit, offset: offset}), 
        rowProcessor,
        rowAccessor).then(function(result) {
            var nextOffset = result.paging.offset + this.defaultPageSize;
            allRows = allRows.concat(result.rows);
            
            var totalRows = result.paging.total < this.maxResults ? result.paging.total : this.maxResults;
            this.reportProgress("Received data for " + description + ". Retrieved " + result.paging.offset + " of " + totalRows);
            if (nextOffset < result.paging.total && nextOffset < this.maxResults) {
                return getPage(this.defaultPageSize, nextOffset);
            } else {
                console.log("Done paging through results. Number of results was " + allRows.length)
                return Promise.resolve(allRows);
            }
        }.bind(this));
    }.bind(this);

    return getPage(this.defaultPageSize, 0);
}

SpotifyRequestor.prototype._getCollectionFromIds = function(ids, blockSize, description, fn, rowProcessor, rowAccessor) {
    // No caching for track features.
    // Request blockSize ids at a time
    var idBlocks = [];
    var currBlock = undefined;
    for(var i = 0; i < ids.length; i++) {
        if (!currBlock || currBlock.length == blockSize) {
            currBlock = new Array();
            idBlocks.push(currBlock);
        }

        currBlock.push(ids[i]);
    }

    // Allocate a results array which will will insert all of our results into. This must return
    // The results in the order which ids were passed in
    var resultBlocks = new Array(idBlocks.length);

    var promises = [];
    for (var i = 0; i < idBlocks.length; i++) {
        var insertValues = function(index, result) {
            // Place these values in their appropriate spot
            resultBlocks[index] = result.rows;
        }.bind(this, i);

        promises.push(this._makeRequestAndProcessRows(
            description,
            fn.bind(this, idBlocks[i]), 
            rowProcessor,
            rowAccessor)
            .then(insertValues)
        );
    }

    return Promise.all(promises).then(function() { 
        var merged = [].concat.apply([], resultBlocks);
        return merged;
    });
}

SpotifyRequestor.prototype.getMyTopArtists = function() {
    if (this._myTopArtists) {
        return Promise.resolve(this._myTopArtists);
    }

    return this._makeRequestAndProcessRows(
        "getMyTopArtists", 
        this.s.getMyTopArtists.bind(this, {time_range: this.timeRange}), 
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
        }).then(function(result) {
            // Cache this off in case we need it later
            this._myTopArtists = result.rows;
            return Promise.resolve(result.rows);
        }.bind(this));
}

SpotifyRequestor.prototype.getMyTopTracks = function() {
    if (this._myTopTracks) {
        return Promise.resolve(this._myTopTracks);
    }

    return this._makeRequestAndProcessRows(
        "getMyTopTracks", 
        this.s.getMyTopTracks.bind(this, {time_range: this.timeRange}), 
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
        }).then(function(result) {
            // Cache this off in case we need it later
            this._myTopTracks = result.rows;
            return Promise.resolve(result.rows);
        }.bind(this));
}

SpotifyRequestor.prototype.getMySavedAlbums = function() {
    if (this._mySavedAlbums) {
        return Promise.resolve(this._mySavedAlbums);
    }

    return this._makeRequestAndProcessRowsWithPaging(
        "getMySavedAlbums", 
        this.s.getMySavedAlbums.bind(this),
        function(albumObject) {
            console.log("Processing album " + albumObject.album.name);              
            return {
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
        }).then(function(data) {
            this._mySavedAlbums = data;
            return data;
        }.bind(this));
}

SpotifyRequestor.prototype.getMySavedTracks = function() {
    if (this._mySavedTracks) {
        return Promise.resolve(this._mySavedTracks);
    }

    return this._makeRequestAndProcessRowsWithPaging(
    "getMySavedTracks", 
    this.s.getMySavedTracks.bind(this),
    function(trackObject) {
        console.log("Processing track " + trackObject.track.name);              
        return {
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
            "uri": trackObject.track.uri
        };
    }).then(function(rows) {
        // We have retrieved all the tracks. Now let's decorate them with some metrics
        var ids = rows.map(function(row) { return row.id; });
        return this.getTrackFeatures(ids).then(function(trackFeatures) {
            var finalResults = rows;
            for(var i = 0; i < trackFeatures.length; i++) {
                for (var attrname in trackFeatures[i]) { 
                    finalResults[i][attrname] = trackFeatures[i][attrname];
                }
            }

            this._mySavedTracks = finalResults;
            return finalResults;
        }.bind(this));
    }.bind(this));
}

SpotifyRequestor.prototype.getMySavedArtists = function() {
    if (this._mySavedArtists) {
        return Promise.resolve(this._mySavedArtists);
    }

    // To get artists, we first must get all the user's albums and tracks since
    // there isn't an endpoint for getting artists
    var allArtists = [];
    var appendArtists = function(rows) {
        var artists = rows.map(function(row) { return row.artist_id; } );
        for(var i in artists) {
            if (allArtists.indexOf(artists[i]) == -1) {
                allArtists.push(artists[i]);
            }
        }
    };

    return Promise.all([
        spotifyRequestor.getMySavedAlbums().then(appendArtists),
        spotifyRequestor.getMySavedTracks().then(appendArtists)]).then(function() {
            return this.getArtists(allArtists).then(function(finalResults) {
                this._mySavedArtists = finalResults;
                return finalResults;
            }.bind(this));
        }.bind(this));
}

SpotifyRequestor.prototype.getArtists = function(ids) {
    // Spotify only lets us request 50 artists at a time
    return this._getCollectionFromIds(ids, 50, "getArtists",
        this.s.getArtists.bind(this), 
        function(artist) {      
            return {
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
        },
        function(data) { return data.artists; });
}

SpotifyRequestor.prototype.getTrackFeatures = function(ids) {
    return this._getCollectionFromIds(ids, 100, "getTrackFeatures",
        this.s.getAudioFeaturesForTracks.bind(this), 
        function(audioFeature) {      
            return {
                "danceability": audioFeature.danceability,
                "energy": audioFeature.energy,
                "key": audioFeature.key,
                "loudness": audioFeature.loudness,
                "mode": audioFeature.mode,
                "speechiness": audioFeature.speechiness,
                "acousticness": audioFeature.acousticness,
                "instrumentalness": audioFeature.instrumentalness,
                "liveness": audioFeature.liveness,
                "valence": audioFeature.valence,
                "tempo": audioFeature.tempo,
                "time_signature": audioFeature.time_signature
            }
        },
        function(data) { return data.audio_features; });
}
