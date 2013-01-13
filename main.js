sp = getSpotifyApi();

var Views = sp.require("$api/views");
var Models = sp.require("$api/models");

LFM.init({
    key: 'a45343ebd38d4aea8e6f334256db9ba0'
});

var Jam = Backbone.Model.extend({
    getTrack: function () {
        return Models.Track.fromURI(this.get('spotify'));
    }
});

$('#iHateCircles').change(function (e) {
    $('body').toggleClass('circleHate', $(this).attr('checked'));
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
    },
    getFrom: function () {
        return new Date(this.rangeFrom);
    },
    getTo: function () {
        return new Date(this.rangeTo);
    },
    getDateRangeString: function () {
        var dateRange = this.getFrom().toString('dddd, MMMM d, yyyy') +
            ' — ' +
            this.getTo().toString('dddd, MMMM d, yyyy');
        return dateRange;
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
    render: function (justMe) {
        var container = $('<div class="jam">');
        
        this.playlist.add(this.model.getTrack());
        this.player.track = this.playlist.get(0);
        this.player.context = this.playlist;
        var player = $(this.player.node);
        player.addClass('sp-image-extra-large');
        player.find('.sp-player-button').before('<div class="arrow">');
        container.append(player);
        
        var userModel = this.model.get('user');
        if (!justMe) {
            var user = $('<a class="user">');
            user.attr('href', userModel.get('url'));
            user.text(userModel.get('name') + '’s jam was…');
            container.append(user);
            container.append('<br>');
        }
        
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
        $(this.el).hide();
        $('h2').hide();
        $('#friendsHeading').hide();
        $('#addPlaylist').hide();
        $('#circleHate').hide();
        $('#dateRange').hide();
        $('body').addClass('loading');
        $(this.el).empty();

        this.user = options.user;
        this.date = options.date;
        this.justMe = options.justMe;
        this.collection.bind('reset', this.render, this);
        this.collection.bind('add', this.renderJam, this);
        
        var self = this;
        
        loadJams(this.user, this.date, this.justMe).done(function (jams, userInfo, rangeFrom, rangeTo) {
            var filteredJams = {};
            // Filter low playcounts and merge in user info
            _.each(jams, function (jam, user) {
                var username = user;
                if (self.justMe) {
                    username = USERNAME;
                }
                if (jam && (jam.playcount > 3 || (self.justMe && jam.playcount > 1))) {
                    filteredJams[user] = {
                        id: user,
                        user: new User(userInfo[username]),
                        artist: jam.artist['#text'],
                        name: jam.name,
                        playcount: jam.playcount
                    };
                }
            });
            populatePlaylinks(filteredJams).done(function (jams) {
                var def = $.Deferred();
                var length = _.values(jams).length;

                def.progress(function (jam, user) {
                    length--;
                    if (!length) {
                        def.resolve();
                    }
                });
                _.each(jams, function (jam, user) {
                    if (!jam.spotify) {
                        searchTrack(jam.artist + ' ' + jam.name).done(function (result) {
                            if (result && result.data.artists[0].name.indexOf(jam.artist) !== -1) {
                                jam.spotify = result.data.uri;
                            } else {
                                console.log(result.data);
                            }
                            def.notify(jam, user);
                        });
                    } else {
                        def.notify(jam, user);
                    }
                });
                def.promise().done(function () {
                    self.collection.rangeFrom = rangeFrom;
                    self.collection.rangeTo = rangeTo;
                    self.collection.reset(_.filter(jams, function (jam) {
                        return jam.spotify;
                    }));
                });
            });
        });
    },
    renderJam: function (jam) {
        var view = new JamView({
            model: jam
        });
        $(this.el).append(view.render(this.justMe).el);
        return view;
    },
    
    addPlaylist: function () {
        var text;
        if (this.justMe) {
            text = "This Was Your Jam";
        } else {
            text = "This Were Your Friends' Jams";
        }
        this.playlist = new Models.Playlist(text + ": " + this.collection.getDateRangeString());
        this.collection.each(function (jam) {
            this.playlist.add(jam.getTrack());
        }, this);
    },
    
    render: function () {
        if (this.justMe) {
            $('#justMeHeading').fadeIn('slow');
        } else {
            $('#friendsHeading').fadeIn('slow');
        }
        $('body').removeClass('loading');

        // Set the date range
        if (this.collection.rangeFrom) {
            $('#dateRange').text(this.collection.getDateRangeString());
        } else {
            $('#dateRange').text('');
        }
        $('#dateRange').fadeIn('slow');
        
        // Add the jams
        this.collection.each(this.renderJam, this);
        
        $(this.el).fadeIn('slow', function () {
            $('#circleHate').show();
        });
        
        // Fill in the add playlist button and show it
        $('#addPlaylist').fadeIn('slow');
        
        return this;
    }
});

function searchTrack (query) {
    var def = $.Deferred();
    var search = new Models.Search(query);
    search.localResults = Models.LOCALSEARCHRESULTS.APPEND;
    search.pageSize = 1;
    search.searchAlbums = false;
    search.searchArtists = false;
    search.searchPlaylists = false;
    search.searchTracks = true;

    search.observe(Models.EVENT.CHANGE, function() {
        def.resolve(search.tracks[0]);
    });
    search.appendNext();
    return def.promise();
}

USERNAME = 'jwheare';

JAMSHIFT = {};

function chooseTab () {
    switch (Models.application['arguments'][0]) {
    case 'justMe':
        init(true);
        break;
    case 'friendsToo':
        init();
        break;
    }
}

chooseTab();

Models.application.observe(Models.EVENT.ARGUMENTSCHANGED, chooseTab);

$('#addPlaylist').click(function () {
    JAMSHIFT.listView.addPlaylist();
});

function init (justMe) {
    if (JAMSHIFT.listView) {
        JAMSHIFT.listView.collection.reset();
    }
    JAMSHIFT.listView = new JamListView({
        collection: new JamList(),
        user: USERNAME,
        date: Date.parse('last year'),
        justMe: !!justMe
    });
}

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
    }, function (xhr) {
        def.reject(xhr);
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
            // Resolve when all pages are done
            def.progress(function (pageFriends, i) {
                pages--;
                if (pageFriends.error) {
                    console.warn('getFriends page error', i, pageFriends.error, pageFriends.message);
                } else if (pageFriends.user) {
                    allFriends = allFriends.concat(pageFriends.user);
                } else {
                    console.warn('getFriends page xhr error', i, pageFriends);
                }
                if (pages == 1) {
                    def.resolve(allFriends);
                }
            });
            _.each(_.range(2, (pages - 0) + 1), function (nextPage, i) {
                getFriends(user, nextPage).then(function (response) {
                    def.notify(response, i);
                });
            });
        }
    }).fail(function (response) {
        def.reject(response);
    });
    return def.promise();
}

function getTopTracksForUserAndDate (user, date) {
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
                            def.resolve(chart, from, to);
                        }
                    }, function (xhr) {
                        def.reject('user.getweeklytrackchart', xhr);
                    });
                }
            });
        }
    }, function (xhr) {
        def.reject('user.getweeklychartlist', xhr);
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
    
    var chunks = chunkObject(jams, 1);
    var chunkLength = chunks.length;
    var userMap = {};
    
    // Populate and resolve when all chunks are loaded
    def.progress(function (response, i, artists, tracks) {
        --chunkLength;
        if (!response || !response.spotify) {
            if (response.error) {
                console.warn('populatePlaylinks error', i, response.error, response.message);
            } else if (response) {
                console.warn('populatePlaylinks empty response', i);
            } else {
                console.warn('populatePlaylinks xhr error', i);
            }
            _.each(_.zip(artists, tracks), function (pair) {
                // console.info('%s - %s', pair[0], pair[1]);
            });
        } else {
            // Populate jams object
            _.each($.makeArray(response.spotify.track), function (track) {
                if (!track.externalids.spotify) {
                    return;
                }
                var trackMap = userMap[track.artist['#text']];
                if (!trackMap) {
                    return;
                }
                var users = trackMap[track.name];
                if (!users) {
                    return;
                }
                _.each(users, function (user) {
                    if (jams[user]) {
                        jams[user].spotify = track.externalids.spotify;
                    }
                });
            });
        }
        if (!chunkLength) {
            def.resolve(jams);
        }
    });
    
    _.each(chunks, function (chunk, i) {
        var artists = [];
        var tracks = [];
        _.each(chunk, function (jam, user) {
            if (!userMap[jam.artist]) {
                userMap[jam.artist] = {};
            }
            if (!userMap[jam.artist][jam.name]) {
                userMap[jam.artist][jam.name] = [];
            }
            userMap[jam.artist][jam.name].push(user);
            artists.push(jam.artist);
            tracks.push(jam.name);
        });
        
        LFM.get('track.getplaylinks', {
            artist: artists,
            track: tracks
        }, function (response) {
            def.notify(response, i, artists, tracks);
        }, function (response) {
            def.notify(response, i, artists, tracks);
        });
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

function loadJams (user, date, justMe) {
    var def = $.Deferred();
    var userJamLoaded = false;
    var userInfoLoaded = false;
    var friendJamsLoaded = justMe;
    
    var jams = {};
    var rangeFrom, rangeTo;
    var userInfo = {};
    
    
    // Resolve when everything is loaded
    def.progress(function () {
        if (userInfoLoaded && friendJamsLoaded && userJamLoaded) {
            def.resolve(jams, userInfo, rangeFrom, rangeTo);
        }
    });

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
        getTopTracksForUserAndDate(user, date).done(function (chart, from, to) {
            rangeFrom = from;
            rangeTo = to;
            if (chart) {
                if (justMe) {
                    _.each(chart, function (chartItem, i) {
                        jams[user + i] = chartItem;
                    });
                } else {
                    jams[user] = chart[0];
                }
            }
            loadDef.resolve();
        }).fail(function (method, response) {
            if (response.error) {
                console.warn('getTopTracksForUserAndDate error', method, response.error, response.message);
            } else {
                console.warn('getTopTracksForUserAndDate xhr error', method, response);
            }
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
    if (!justMe) {
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
            if (response.error) {
                console.warn('getAllFriends error', response.error, response.message);
            } else {
                console.warn('getAllFriends error', response);
            }
            // Error, notify
            friendJamsNotify();
        });
    }
    
    return def.promise();
}
