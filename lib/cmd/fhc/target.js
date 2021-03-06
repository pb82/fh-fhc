// target millicore
module.exports = target;
target.desc = "Get/Set the FeedHenry FHC Target URL";
target.usage = "fhc target"
            +"\nfhc target <feedhenry-url>"
            +"\nfhc target <feedhenry-url> <user>"
            +"\nfhc target <feedhenry-url> <user> <password>";

var fhc = require("../../fhc");
var ini = require("../../utils/ini");
var login = require("./login.js");
var targets = require("./targets.js");
var log = require("../../utils/log");
var request = require('request').defaults( {'proxy': fhc.config.get("proxy")});
var keys = require('../common/keys/user.js');
var ngui = require("../common/ngui");
var version = require("../common/version.js");
var async = require('async');

// Main target entry point
function target (argv, cb) {
  var args = argv._;
  var targ = fhc.config.get("feedhenry");
  if (args.length === 0){
    if (!targ) return cb(undefined, "You have not targetted a domain - please target one via `fhc target <hostname>`");
    return cb(undefined, targ);
  }

  if (args.length !== 1 && args.length > 4)  return cb(target.usage);
  var tar = args[0];

  // Check if target begins with http/https
  if (tar.indexOf('http://') !== 0 && tar.indexOf('https://') !== 0) {
    log.info("No http/https given, assuming https://");
    tar = "https://" + tar;
  }

  async.series([
    function(cb){
      // Valiate FeedHenry target can be pinged..
      pingTarget([tar], function(err, data){
        if(err) return cb(err);
        if(data.statusCode !== 200) return cb("Invalid target: " +tar);

        return cb();
      });
    },
    function (cb){
      //First, checking if the target platform version is greater than a minimum value.
      version.checkTargetVersion([tar], cb);
    }
  ], function(err){
    if(err){
      return cb(err);
    }
    // TODO - suboptimal this now that we have 'targets', ini file being saved twice.. REFACTOR
    log.silly(tar, "Setting new feedhenry url");
    var where = ini.get("global") ? "global" : "user";
    ini.set('feedhenry', tar, where);
    ini.save(function(err) {
      if (err) return cb(err);

      if (args.length === 3) {
        return login({ _ : [args[1], args[2]] }, cb);
      }else {
        // attempt to set existing target cookie..
        var t = {
          target: tar
        };
        if(args[1]) t['user'] = args[1];

        log.silly(t, "Getting Target");
        var targ = targets.getTarget(t);
        log.silly(targ, "Got Target");
        if (typeof targ === 'undefined') {
          ini.del("cookie");
          keys.delUserApiKey();
          ini.save(function(err){
            target.message = "Successfully targeted " + tar;
            target.message += " - now, log in.\n";
            target.message += login.usage;
            return cb(err, tar);
          });
        }else {
          // set username and cookie
          if(null !== targ.user && typeof targ.user !== "undefined"){
            ini.set("username", targ.user, "user");
          }
          if(null !== targ.cookie && typeof targ.cookie !== "undefined"){
            ini.set("cookie", targ.cookie, "user");
          }
          if(null !== targ.domain && typeof targ.domain !== "undefined"){
            ini.set("domain", targ.domain, "user");
          }
          if(null !== targ[keys.KEY_ID] && typeof targ[keys.KEY_ID] !== "undefined"){
            ini.set(keys.KEY_ID, targ[keys.KEY_ID], "user");
          }

          var _gotVersion = function(){
            ini.save(function(err){
              target.message = "Successfully targeted: " + targ.target + (targ.user ? (" User: " + targ.user) : (" API Key: " + targ[keys.KEY_ID]));
              return cb(err, targ);
            });
          };

          ngui({_ : []}, function(err, isFh3){
            if (err){
              if (!targ.fhversion){
                target.message += 'Your login has expired - please log in again!\n ' + login.usage;
              }else{
                ini.set('fhversion', targ.fhversion)
              }
              return _gotVersion();
            }
            var version = (isFh3) ? 3 : 2;
            ini.set('fhversion', version);
            return _gotVersion();
          });
        }
      }
    });
  });
}

function pingTarget(targ, callback) {
  request(targ + "/box/srv/1.1/act/sys/auth/logout", function(err, response, body){
    if(err) return callback(err);
    return callback(err, {statusCode: response.statusCode, data: body});
  });
}

// bash completion
target.completion = function (opts, cb) {
  var targs = targets.getTargets();
  var tgs = [];
  for (var i=0; i<targs.length; i++) {
    tgs.push(targs[i].target);
  }
  return cb(null, tgs);
};
