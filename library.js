(function (module) {
    "use strict";

    var plugin = {};

    var Socket = module.parent.require('./socket.io/modules'),
        User = module.parent.require('./user'),
        db = module.parent.require('./database'),
        async = module.parent.require('async'),
        helpers = module.parent.require('./controllers/helpers'),
        nconf = module.parent.require('nconf'),
        templates = module.parent.require('templates.js'),
        translator = require.main.require('./public/src/modules/translator');


    /**
     * Check if the post belongs to an ignored user
     */
    plugin.parse = function (data, callback) {
        try {
            async.eachSeries(data.posts,
            function(p, cb){
                if (data && p && data.uid && data.uid !== p.uid) {
                    User.isIgnored(data.uid, p.uid, function (err, ignored) {
                        if (err) {
                            console.error("Error checking if the user has been ignored " + p.uid, e);
                            cb();
                        }

                        p.originalContent = p.content;
                        p.ignored = ignored;
                        if(ignored){
                            translator.translate('[[ignored:ignored_post]]', function(translated) {
                                console.log('Translated string:', translated);
                                p.content = translated;
                                cb();
                            });
                        }else{
                            cb();
                        }
                        

                    });
                } else {
                    cb();
                }
            }, function(r){
                callback(null, data);
            });
        } catch (e) {
            console.error("Error parsing the post content ", e);
            callback(null, data);
        }
    };

    /**
     * It defines the “/user/:userlug/ignored” new paths that will display the user's ignore list 
     */
    plugin.init = function (params, callback) {
        var app = params.router,
            controllers = params.controllers;

        controllers.accounts.getIgnored = function (req, res, next) {
            if (!req.user) {
                return helpers.notAllowed(req, res);
            }

            async.waterfall([

                function (next) {
                    User.getUidByUserslug(req.params.userslug, next);
                },
                function (uid, next) {
                    if (req.user.uid !== uid) {
                        return helpers.notAllowed(req, res);
                    }
                    User.getIgnoredUsers(req.user.uid, next);
                    
                },
                User.getUsersData
            ], function (err, users) {
                if (err) {
                    console.err(err);
                    return helpers.notFound(req, res);
                }
               
                res.render('account/ignored', {
                    showSettings: true,
                    showHidden: true,
                    isSelf: true,
                    userslug: req.params.userslug,
                    ignored: users,
                    ignoredCount: users.length
                });
            });

        }

        app.get('/user/:userslug/ignored', params.middleware.buildHeader, controllers.accounts.getIgnored);
        app.get('/api/user/:userslug/ignored', controllers.accounts.getIgnored);

        templates.setGlobal('ignorePluginEnabled', true);

        callback();
    };

    plugin.changeClientRouting = function (config, callback) {
        config.custom_mapping['^user/.*/ignored'] = 'account/ignored';
        callback(null, config);
    }

    /**
     * "Hook" is called when a user's profile is displayed. We use it to check whether someone is ignored or not.
     */
    plugin.checkIgnoredAccount = function (data, callback) {
        try {
            if (data.uid && data.uid !== data.userData.uid) {
                User.isIgnored(data.uid, data.userData.uid, function (err, ignored) {
                    if (err) {
                        console.error("[PROFILE] Error while checking if an user is ignored " + data.userData.uid, e);
                        return callback(null, data);
                    }
                    
                    data.userData.isIgnored = ignored;
                    callback(null, data);
                });
            } else {
                callback(null, data);
            }
        } catch (e) {
            console.error("[PROFILE] Error checking whether a user is being ignored while checking its profile " + data.userData.uid, e);
            callback(null, data);
        }
    }

    /**
     * It checks if an user (uid) has another user (otheruid) in the ignore list
     */
    User.isIgnored = function (uid, otheruid, callback) {
        db.isSetMember('ignored:' + uid, otheruid, callback);
    };

    /**
     * It returns an user's ignore list
     */
    User.getIgnoredUsers = function (uid, callback) {
        db.getSetMembers('ignored:' + uid, callback);
    };

    /**
     * It adds an user to the ignore list
     */
    Socket.ignoreUser = function (socket, data, callback) {
        db.setAdd('ignored:' + socket.uid, data.ignoreduid, callback);
    };

    /**
     * It removes an user from the ignore list
     */
    Socket.unignoreUser = function (socket, data, callback) {
        db.setRemove('ignored:' + socket.uid, data.ignoreduid, callback);
    };

    /**
     * It flags the ignored user's threads. Then, the threads are hidden.
     */
    plugin.filterIgnoredTopics = function (data, callback) {
        
        User.getIgnoredUsers(data.uid, function (err, ignoredUsers) {
            if (ignoredUsers && ignoredUsers.length) {
                data.topics.forEach(function (topic) {
                    topic.ignored = ignoredUsers.indexOf(topic.uid.toString()) !== -1;
                });
            }
            
            callback(null, data);
        })
        
    };
    
    /*plugin.testNotificationPushed = function name(params) {
        
    };
    
    plugin.testNotificationMerge = function name(data, callback) {
        
    };*/

    module.exports = plugin;
}(module));
