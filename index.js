"use strict";

var async = require('async');
var ProgressBar = require('progress');
var _ = require('lodash');
var jsonfile = require('jsonfile');
var util = require('util');

var walk    = require('walk');
var fs      = require('fs');
var argv = require('yargs').argv;

var sqlite3 = require('sqlite3').verbose();
var mysql      = require('mysql');

var walker  = walk.walk(argv.dir, {
  followLinks: false,
  filters: ["addon_data", "peripheral_data", "addons"]
});

var connection = mysql.createConnection({
  host     : argv.host || 'localhost',
  user     : argv.user || 'kodi',
  password : argv.password || 'kodi',
  database : argv.database || 'MyVideos90'
});

var databases = [];
var movies = [];
var episodes = [];

walker.on('file', function (root, fileStats, next) {
  if (fileStats.name.match(/^MyVideos[0-9]+\.db$/)) {
    databases.push(root + '/' + fileStats.name);
  }
  next();
});

walker.on('end', function() {
  var readWatchedFlags = function (filename, cb) {
    var db = new sqlite3.Database(filename);

    db.serialize(function() {
      db.each("SELECT c09 as imdbID, c00 AS title FROM movieview WHERE playCount > 0", function(err, row) {
        if (err) throw err;

        if (row.imdbID.length > 0 && _.isUndefined(_.find(movies, function (movie) {
          return movie.imdbID == row.imdbID;
        }))) {
          movies.push(row);
        }
      });
      db.each("SELECT t.c12 AS tvdbID, v.strTitle AS showtitle, v.c00 AS title, v.c12 AS season, v.c13 AS episode FROM episodeview AS v LEFT JOIN tvshow AS t ON v.idShow = t.idShow WHERE v.playCount > 0", function(err, row) {
        if (err) throw err;

        if (row.tvdbID.length > 0 && _.isUndefined(_.find(episodes, function (episode) {
          return episode.tvdbID == row.tvdbID
            && episode.season == row.season
            && episode.episode == row.episode;
        }))) {
          episodes.push(row);
        }
      });
    });

    db.close(cb);
  }

  console.log('\n\nStarting watch flag search in the following databases:\n');
  async.each(databases, function (database, cb) {
    console.log(database);
    cb();
  }, function () {
    console.log('\n\n');
  });

  async.each(databases, readWatchedFlags, function () {
    console.log('Finished search within ' + argv.dir + '\n\n');

    console.log('Found ' + movies.length +  ' watched movies.');
    console.log('Found ' + episodes.length +  ' watched episodes.\n\n');

    jsonfile.writeFile('./movies.json', movies, {spaces: 2}, function (err) {
      if (err) console.error(err);
    })

    jsonfile.writeFile('./episodes.json', episodes, {spaces: 2}, function (err) {
      if (err) console.error(err);
    })

    console.log('Connecting to remote database');

    connection.connect(function () {
      console.log('Connecting established\n\n');
    });

    async.series([
      function (cb) {
        // Set movies watch flags
        var setMovieWatchedFlag = function (movie, cb2) {
          var query = 'UPDATE files AS f \
                      INNER JOIN movie AS m \
                      ON m.idFIle = f.idFile \
                      AND m.c09 = "' + movie.imdbID + '" \
                      SET f.playCount = 1';

          connection.query(query, function(err, rows, fields) {
            if (err) throw err;

            bar.tick();
            cb2();
          });
        };

        var bar = new ProgressBar('Set watch flags for movies [:bar] :percent :etas', {
          complete: '=',
          incomplete: ' ',
          width: 40,
          total: movies.length
        });

        async.each(movies, setMovieWatchedFlag, function () {
          console.log('Updated Movies.\n\n');
          cb();
        });
      },
      function (cb) {
        // Set episodes watch flags
        var setEpisodeWatchedFlag = function (episode, cb2) {

          var query = 'UPDATE files AS f \
                      INNER JOIN episode AS e \
                      ON e.idFIle = f.idFile \
                      AND e.c12 = "' + episode.season + '" \
                      AND e.c13 = ' + episode.episode + ' \
                      INNER JOIN tvshow AS t \
                      ON e.idShow = t.idShow \
                      AND t.c12 = ' + episode.tvdbID + ' \
                      SET f.playCount = 1';

          connection.query(query, function(err, rows, fields) {
            if (err) throw err;

            bar.tick();
            cb2();
          });
        };

        var bar = new ProgressBar('Set watch flags for tv episodes [:bar] :percent :etas', {
          complete: '=',
          incomplete: ' ',
          width: 40,
          total: episodes.length
        });

        async.each(episodes, setEpisodeWatchedFlag, function () {
          console.log('Updated tv episodes.\n\n');
          cb();
        });
      },
      function (cb) {
        connection.end();
        console.log('Finished. You can now find a list of all processed movies and episodes next to this file.\n\n');
        console.log('Enjoy your updated Kodi database :)');
        cb();
      }
    ]);
  });
});