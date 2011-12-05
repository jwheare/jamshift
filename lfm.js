var LFM = (function () {
  var apiRoot = 'http://ws.audioscrobbler.com/2.0/?format=json';
  var apiAuthUrl = 'http://www.last.fm/api/auth';
  var apiKey, apiSecret, callback_uri;

  var session = null;

  // Method that gets called after LFM.login()
  var authCallback = null;

  // Make an api request
  var api = function (method, type, params, callback, failure) {
    var data = {
      'api_key': apiKey,
      'method': method
    };
    data = mergeObjects(data, params);
    if (session) {
      data.sk = session.key;
      data.api_sig = getApiSignature(data);
    }
    
    data = parameterise(data);
    var url = apiRoot;
    var m = type.toUpperCase();
    if (m === 'GET') {
      url += '&' + data;
    }
    var http_request = new XMLHttpRequest();
    http_request.open(m, url, true);
    if (m === 'POST') {
      http_request.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
      http_request.setRequestHeader("Content-length", data.length);
      http_request.setRequestHeader("Connection", "close");
    }
    http_request.onreadystatechange = function () {
      var done = 4, ok = 200;
      if (http_request.readyState === done) {
        if (http_request.status === ok) {
          callback(JSON.parse(http_request.responseText));
        } else {
          failure(http_request);
        }
      }
    };
    http_request.send((m === 'POST') ? data : null);

  };

  // Sign api request
  var getApiSignature = function (params) {
    var keys   = [];
    var string = '';
    var key, index, k;
    for (key in params) {
      if (params.hasOwnProperty(key)) {
        keys.push(key);
      }
    }
    keys.sort();
    for (index in keys) {
      if (keys.hasOwnProperty(index)) {
        k = keys[index];
        string += k + params[k];
      }
    }
    string += apiSecret;
    return Crypto.MD5(string);
  };

  // Get/set data
  var Data = {
    get: function (key) {
      return JSON.parse(localStorage.getItem(key));
    },
    set: function (key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    },
    del: function (key) {
      localStorage.removeItem(key);
    }
  };

  // Create a serialized representation of an object
  var parameterise = function (params) {
    var a = [];
    var name;
    for (name in params) {
      if (params.hasOwnProperty(name)) {
        var value = params[name];
        if (Array.isArray(value)) {
          for (var i = 0; i < value.length; i++) {
            a.push(name + "[]=" + escape(value[i]));
          }
        } else {
          a.push(name + "=" + escape(value));
        }
      }
    }
    return a.join("&");
  };

  // Parse DOMWindow.location object
  var parseLocation = function (location) {
    var splitted = (location.search + location.hash).split(/[&?#]/);
    var obj = {};
    var i, kv;
    for (i in splitted) {
      if (splitted.hasOwnProperty(i)) {
        kv = splitted[i].split("=");
        if (kv[0]) {
          obj[kv[0]] = unescape(kv[1]);
        }
      }
    }
    return obj;
  };
  
  // Merge two objects
  var mergeObjects = function (obj1, obj2) {
    var obj3 = {};
    var attrname1, attrname2;
    for (attrname1 in obj1) { if (obj1.hasOwnProperty(attrname1)) { obj3[attrname1] = obj1[attrname1]; } }
    for (attrname2 in obj2) { if (obj2.hasOwnProperty(attrname2)) { obj3[attrname2] = obj2[attrname2]; } }
    return obj3;
  };

  return {
    init: function (options) {
      apiKey = options.key;
      apiSecret = options.secret || null;
      session = Data.get('LFM');
      callback_uri = options.callback_uri || null;
    },
    getSession: function () {
      return session;
    },
    login: function (callback) {
      authCallback = callback;
      var url = apiAuthUrl + '?' + parameterise({
        api_key: apiKey,
        cb: callback_uri
      });
      window.open(url, 'lastfmLogin', 'height=600,width=980');
    },
    logout: function (callback) {
      Data.del('LFM');
      callback();
    },
    loginCallback: function () {
      var popup = window.open("", "lastfmLogin");
      var params = parseLocation(popup.location);
      var session = {};
      popup.close();
      if (params.token) {
        // get session
        api('auth.getSession', 'post', {token: params.token}, function (response) {
          session = {
            user: response.session.name,
            key: response.session.key
          };
          Data.set('LFM', session);
        });
      }
      authCallback(session);
    },
    get: function (method, params, callback) {
      api(method, 'GET', params, callback);
    },
    post: function (method, params, callback) {
      api(method, 'POST', params, callback);
    }
  };
}());