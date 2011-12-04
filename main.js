sp = getSpotifyApi(1);

var Views = sp.require("sp://import/scripts/api/views");
var Models = sp.require("sp://import/scripts/api/models");

LFM.init({
    key: 'bcb7248fa7b2a020b568960bb4afac18'
});

var Jam = Backbone.Model.extend({
    getFrom: function () {
        return new Date(this.get('from'));
    },
    getTo: function () {
        return new Date(this.get('to'));
    },
    getTrack: function () {
        return Models.Track.fromURI(this.get('spotify'));
    }
});
var User = Backbone.Model.extend();
var JamList = Backbone.Collection.extend({
    model: Jam,
    context: null,
    previousContext: null,
    initialize: function (models, options) {
        Models.player.observe(Models.EVENT.CHANGE, _.bind(function (event) {
            if (event.data.curcontext) {
                this.previousContext = this.context;
                this.context = Models.player.context;
                this.trigger('curContextChange', this.previousContext, this.context);
            }
        }, this));
    }
});

var JamView = Backbone.View.extend({
    tagName: 'li',
    initialize: function (options) {
        this.playlist = new Models.Playlist();
        this.player = new Views.Player();
        this.model.collection.bind('curContextChange', function (previous, current) {
            if (current == null && previous == this.player.context.uri) {
                // Stopped, play next
                var next = this.model.collection.at(this.model.collection.indexOf(this.model) + 1);
                if (next) {
                    next.trigger('play');
                }
            }
        }, this);
        this.model.bind('play', function () {
            this.player.playing = true;
        }, this);
    },
    render: function () {
        var container = $('<div class="jam">');
        
        this.playlist.add(this.model.getTrack());
        this.player.track = this.playlist.get(0);
        this.player.context = this.playlist;
        container.append($(this.player.node).addClass('sp-image-extra-large'));
        
        var user = $('<a class="user">');
        var userModel = this.model.get('user');
        user.attr('href', userModel.get('url'));
        user.text(userModel.get('name') + '’s jam was…');
        container.append(user);
        
        container.append('<br>');
        
        var trackLink = $('<a class="trackLink">').attr('href', this.model.get('spotify'));
        var track = $('<span class="track">').text(this.model.get('name'));
        var artist = $('<span class="artist">').text('by ' + this.model.get('artist'));
        trackLink.append(track).append('<br>').append(artist);
        container.append(trackLink);
        
        container.append('<br>');
        
        var played = $('<span class="playcount">').text(this.model.get('playcount') + ' plays');
        container.append(played);
        
        container.addClass(userModel.get('name').toLowerCase());
        
        $(this.el).append(container);
        
        return this;
    }
});
var JamListView = Backbone.View.extend({
    el: '#jamList',
    initialize: function (options) {
        this.user = options.user;
        this.date = options.date;
        this.collection.bind('reset', this.render, this);
        this.collection.bind('add', this.renderJam, this);
        
        var self = this;
        
        loadJams(this.user, this.date).done(function (jams, userInfo) {
            var filteredJams = {};
            // Filter low playcounts and merge in user info
            _.each(jams, function (jam, user) {
                if (jam.playcount > 3) {
                    filteredJams[user] = {
                        id: user,
                        user: new User(userInfo[user]),
                        artist: jam.artist['#text'],
                        name: jam.name,
                        playcount: jam.playcount,
                        from: jam.from,
                        to: jam.to
                    };
                }
            });
            populatePlaylinks(filteredJams).done(function (jams) {
                for (var user in jams) {
                    if (!jams[user].spotify) {
                        delete jams[user];
                    }
                }
                self.collection.reset(_.values(jams));
            });
        });
    },
    renderJam: function (jam) {
        this.playlist.add(jam.getTrack());
        var view = new JamView({
            model: jam
        });
        $(this.el).append(view.render().el);
        return view;
    },
    render: function () {
        // Set the date range
        var first = this.collection.first();
        var dateRange = first.getFrom().toString('dddd, MMMM d, yyyy') +
            ' — ' +
            first.getTo().toString('dddd, MMMM d, yyyy');
        $('#dateRange').text(dateRange);
        
        this.playlist = new Models.Playlist("This Was My Jam: " + dateRange);
        
        // Add the jams
        $(this.el).empty();
        this.collection.each(this.renderJam, this);
        
        // Fill in the add playlist button and show it
        $('#addPlaylist').attr('value', this.playlist.uri).show();
        
        return this;
    }
});

JAMSHIFT = {
    listView: new JamListView({
        collection: new JamList(),
        user: 'jwheare',
        date: Date.parse('last year')
    })
};

function getFriends (user, page) {
    page = page || 1;
    var def = $.Deferred();
    LFM.get('user.getfriends', {
        user: user,
        limit: 200,
        page: page
    }, function (response) {
        if (response.error) {
            def.reject(response);
        } else {
            def.resolve(response.friends);
        }
    });
    return def.promise();
}

function getAllFriends (user) {
    var def = $.Deferred();
    getFriends(user).done(function (friends) {
        var pages = friends['@attr'].totalPages;
        if (pages == 1) {
            // Only one page, resolve
            def.resolve($.makeArray(friends.user));
        } else if (friends['@attr'].page == 1) {
            // More than one page, this is the first page
            // Get the rest of the pages and notify on each load
            var allFriends = friends.user;
            _.each(_.range(2, (pages - 0) + 1), function (nextPage, i) {
                getFriends(user, nextPage).then(function (response) {
                    def.notify(response, i);
                });
            });
            // Resolve when all pages are done
            def.progress(function (pageFriends, i) {
                pages--;
                if (pageFriends.error) {
                    console.warn('getFriends page error', i, pageFriends.error, pageFriends.message);
                } else {
                    allFriends = allFriends.concat(pageFriends.user);
                }
                if (pages == 1) {
                    def.resolve(allFriends);
                }
            });
        }
    }).fail(function (response) {
        def.reject(response);
    });
    return def.promise();
}

function getTopTrackForUserAndDate (user, date) {
    var def = $.Deferred();
    var time = date.getTime();
    LFM.get('user.getweeklychartlist', {
        user: user
    }, function (listResponse) {
        if (listResponse.error) {
            def.reject('user.getweeklychartlist', listResponse);
        } else {
            _.each($.makeArray(listResponse.weeklychartlist.chart), function (range) {
                var from = range.from * 1000;
                var to = range.to * 1000;
                if (time > from && time < to) {
                    LFM.get('user.getweeklytrackchart', {
                        user: user,
                        from: range.from,
                        to: range.to
                    }, function (chartResponse) {
                        if (chartResponse.error) {
                            def.reject('user.getweeklytrackchart', chartResponse);
                        } else {
                            var chart = $.makeArray(chartResponse.weeklytrackchart.track);
                            var jam = chart[0];
                            if (jam) {
                                jam.from = from;
                                jam.to = to;
                            }
                            def.resolve(jam);
                        }
                    });
                }
            });
        }
    });
    return def.promise();
}

function chunkObject(obj, size) {
    var x, p = '', i = 0, c = -1, n = [];
    if (size < 1) {
        return null;
    }
    for (p in obj) {
        if (obj.hasOwnProperty(p)) {
            x = i % size;
            if (x) {
                n[c][p] = obj[p];
            } else {
                n[++c] = {};
                n[c][p] = obj[p];
            }
            i++;
        }
    }
    return n;
}

function populatePlaylinks (jams) {
    var def = $.Deferred();
    
    var chunks = chunkObject(jams, 10);
    var chunkLength = chunks.length;
    
    var userMap = {};
    
    _.each(chunks, function (chunk, i) {
        var artists = [];
        var tracks = [];
        _.each(chunk, function (jam, user) {
            if (!userMap[jam.artist]) {
                userMap[jam.artist] = {};
            }
            userMap[jam.artist][jam.name] = user;
            artists.push(jam.artist);
            tracks.push(jam.name);
        });
        
        LFM.get('track.getplaylinks', {
            artist: artists,
            track: tracks
        }, function (response) {
            def.notify(response, i, artists, tracks);
        });
    });
    
    // Populate and resolve when all chunks are loaded
    def.progress(function (response, i, artists, tracks) {
        --chunkLength;
        if (!response || response.error) {
            if (response.error) {
                console.warn('populatePlaylinks error', i, response.error, response.message);
            } else {
                console.warn('populatePlaylinks error', i);
            }
            _.each(_.zip(artists, tracks), function (pair) {
                console.warn('%s - %s', pair[0], pair[1]);
            });
        } else {
            // Populate jams object
            _.each($.makeArray(response.spotify.track), function (track) {
                var trackMap = userMap[track.artist['#text']];
                if (trackMap) {
                    var user = trackMap[track.name];
                    if (user && jams[user]) {
                        if (track.externalids.spotify) {
                            jams[user].spotify = track.externalids.spotify;
                        }
                    }
                }
            });
        }
        if (!chunkLength) {
            def.resolve(jams);
        }
    });
    
    return def.promise();
}

function getUserInfo (user) {
    var def = $.Deferred();
    LFM.get('user.getInfo', {
        user: user
    }, function (response) {
        if (response.error) {
            def.reject(response);
        } else {
            def.resolve(response);
        }
    });
    return def.promise();
}

function loadJams (user, date) {
    var def = $.Deferred();
    var userJamLoaded = false;
    var userInfoLoaded = false;
    var friendJamsLoaded = false;
    
    var jams = {};
    var userInfo = {};
    
    // Get user info
    getUserInfo(user).then(function (response) {
        if (response.error) {
            console.warn('getUserInfo error', user, response.error, response.message);
        } else {
            userInfo[user] = response.user;
        }
        // User info loaded
        userInfoLoaded = true;
        def.notify();
    });
    
    function loadJam (user, date) {
        var loadDef = $.Deferred();
        getTopTrackForUserAndDate(user, date).done(function (jam) {
            if (jam) {
                jams[user] = jam;
            }
            loadDef.resolve();
        }).fail(function (method, response) {
            console.warn('getTopTrackForUserAndDate error', method, response.error, response.message);
            loadDef.reject();
        });
        return loadDef.promise();
    }
    
    // Load user jam
    loadJam(user, date).then(function () {
        // User jam loaded, notify
        userJamLoaded = true;
        def.notify();
    });
    // Load friend jams
    function friendJamsNotify () {
        friendJamsLoaded = true;
        def.notify();
    }
    getAllFriends(user).done(function (friends) {
        var count = friends.length;
        if (count) {
            _.each(friends, function (friend) {
                userInfo[friend.name] = friend;
                loadJam(friend.name, date).then(function () {
                    if (!--count) {
                        // No friends left, notify
                        friendJamsNotify();
                    }
                });
            });
        } else {
            // No friends, notify
            friendJamsNotify();
        }
    }).fail(function (response) {
        console.warn('getAllFriends error', response.error, response.message);
        // Error, notify
        friendJamsNotify();
    });
    
    // Resolve when everything is loaded
    def.progress(function () {
        if (userInfoLoaded && friendJamsLoaded && userJamLoaded) {
            def.resolve(jams, userInfo);
        }
    });
    
    return def.promise();
}
