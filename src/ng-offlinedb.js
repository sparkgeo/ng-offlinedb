/* globals angular, console, Dexie */
/* jshint strict: true */

// App Config Options
// ------------------

// * offlineDbName: Indexed db name
// * offlineTableName: Table name
// * offlineDbPrimaryKey: Primary key name, default: 'id'
// * offlineDbIndicies: (see: https://github.com/dfahlander/Dexie.js/wiki/Version.stores())
// * offlineDbStructure: (see: https://github.com/dfahlander/Dexie.js/wiki/Table.mapToClass())

angular.module('ng-offlinedb', []).factory('OfflineDb', [
  '$window',
  '$q',
  '$http',
  function(
    $window,
    $q,
    $http
  ) {
    'use strict';
    var DB_VERSION = 1;

    function generateUuid() {
      var d = new Date().getTime();
      if (window.performance && typeof window.performance.now === 'function') {
        d += performance.now(); //use high-precision timer if available
      }
      var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d / 16);
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
      return uuid;
    }

    return function(dbname, remote_url, options) {
      if (remote_url && !remote_url.endsWith('/')) {
        remote_url = '/';
      }
      var is_online = navigator.onLine;

      var opts = options || {};
      opts.offlineDbName = dbname;
      opts.offlineTableName = opts.offlineTableName || opts.offlineDbName;
      opts.offlineDbPrimaryKey = opts.offlineDbPrimaryKey || 'id';
      opts.offlineDbIndicies = opts.offlineDbIndicies || '';
      opts.offlineDbStructure = opts.offlineDbStructure || {id: String};

      // Ensure that primary key is included in indices.
      if (opts.offlineDbIndicies.indexOf('&' + opts.offlineDbPrimaryKey) === -1) {
        var indices = '&' + opts.offlineDbPrimaryKey;
        if (opts.offlineDbIndicies.trim().length > 0) {
          indices += ',' + opts.offlineDbIndicies;
        }
        opts.offlineDbIndicies = indices;
      }

      opts.offlineDbStructure.$$synced = Boolean;
      opts.offlineDbStructure.$$deleted = Boolean;

      function OfflineDb(remote_url) {
        var self = this;
        var schema = {};
        
        self.remote_url = remote_url;
        self.db = new Dexie(opts.offlineDbName, {
          autoOpen: true
        });

        // Database setup
        schema[opts.offlineTableName] = opts.offlineDbIndicies;
        self.db.version(DB_VERSION).stores(schema);

        function _get_resource_url(pk) {
          if (self.remote_url == null) {
            return null;
          }

          var url = self.remote_url;
          if (pk) {
            url += pk + '/';
          }
          return url;
        }

        function _save(data, synced, deleted) {
          synced = synced || false;
          deleted = deleted || false;
          data.$$synced = synced;
          data.$$deleted = deleted;
          return self.db.transaction('rw?', self.db[opts.offlineTableName], function() {
            return self.db[opts.offlineTableName].put(data).then(function() {
              return data;
            });
          });
        }

        function _delete(pk) {
          return self.db[opts.offlineTableName]
            .where(opts.offlineDbPrimaryKey)
            .equals(pk)
            .delete();
        }

        function _remoteSync(action, record) {
          var url;
          var pk = record[opts.offlineDbPrimaryKey];
          if (!is_online) {
            console.log('[' + action + '] Offline not remotely syncing');
            return $q.when(record);
          }

          if (!self.remote_url) {
            console.log('[' + action + '] No remote_url defined, not remotely syncing');
            return $q.when(record);
          }

          if (action === 'post') {
            url = _get_resource_url();
            var r_record = angular.fromJson(angular.toJson(record));
            return $http.post(url, r_record).then(function() {
              return _save(record, true);
            });
          } else if (action === 'put') {
            url = _get_resource_url(pk);
            // Strip 'system' properties
            var r_data = angular.fromJson(angular.toJson(record));
            return $http.put(url, r_data).then(function() {
              return _save(record, true);
            });
          } else if (action === 'delete') {
            url = _get_resource_url(pk);
            return $http.delete(url).then(function() {
              return _delete(pk);
            });
          }
          throw action + ' not supported';
        }

        self.filter = function(qry_args) {
          var db = self.db[opts.offlineTableName];
          qry_args = qry_args || {};
          qry_args.$$deleted = false;

          return db.toArray(function(arr) {

            return arr.filter(function(r) {
              var is_match = true;
              for (var k in qry_args) {
                if (k in r && r[k] !== qry_args[k]) {
                  is_match = false;
                  break;
                }
                return is_match;
              }
            });
          });
        };

        self.get = function(pk) {
          return $q.when(self.db[opts.offlineTableName].get(pk, function(record) {
            if (record.$$deleted) {
              return null;
            }
            return record;
          }));
        };

        function _create(pk, record, synced) {
          var rec;
          synced = synced || false;

          // Prep new record
          record[opts.offlineDbPrimaryKey] = pk;
          rec = angular.extend({}, record);
          rec.$$synced = false;
          rec.$$deleted = false;

          return _save(rec);
        }

        self.create = function(record) {
          var pk = generateUuid();

          return _create(pk, record).then(function(rec) {
            return _remoteSync('post', angular.extend(new OfflineRecord(), rec));
          });
        };

        // Add remote record directly to local database, creates 
        // OfflineRecord but doesn't try to remotely sync.  If
        // record already exsists locally the record is no added.
        // Example:
        // 
        // var db = OfflineDb(APP_CONFIG.localDbName, 'https://test.com/records/');
        // $http.get(offlinedb.remote_url).then(function(resp) {
        //   angular.forEach(resp.data.results, function(rec) {
        //     db.addRemoteRecord(rec);
        //   });
        // });
        // 
        self.addRemoteRecord = function(record) {
          var pk = record[opts.offlineDbPrimaryKey]; 
          if (pk == null) {
            throw 'Primary key not defined';
          }
          // Check to see if record already exists
          return self.get(pk).then(function(r) {
            if (r == null) {
              return _create(pk, record, true)
            }
          });
        };

        self.clear = function() {
          return self.db[opts.offlineTableName].clear();
        };

        // Tries to remotely sync any records in
        // local storage that aren't synced.
        self.syncBacklog = function() {
          self.filter({$$synced: false}).then(function(records) {
            angular.forEach(records, function(record) {
                record.remote_sync();
            });
          });
        };

        /**************************************
         *                                     *
         *         OfflineRecord Class         *
         *                                     *
         **************************************/

        function OfflineRecord() {}

        OfflineRecord.prototype.remote_sync = function() {
          var action = 'put';
          if (this.$$deleted === true && this.$$synced === false) {
            action = 'delete';
          }
          return _remoteSync(action, this);
        };

        OfflineRecord.prototype.delete = function() {
          var record = this;
          return _save(record, false, true).then(function() {
            return record.remote_sync('delete', record);
          });
        };

        OfflineRecord.prototype.update = function() {
          var record = this;
          var pk = record[opts.offlineDbPrimaryKey];
          if (pk == null) {
            throw '`' + opts.offlineDbPrimaryKey + '` does not exist or not defined';
          }
          if (record.$$deleted === true) {
            throw 'Record does not exist';
          }

          return _save(record).then(function() {
            return record.remote_sync('put', record);
          });
        };

        /*******************//*******************/

        self.db[opts.offlineTableName].mapToClass(OfflineRecord, opts.offlineDbStructure);

        // In the case that we're offline and come back online,
        // process any records that haven't been synced.
        $window.addEventListener('online', function() {
          is_online = true;
          self.syncBacklog();

        }, false);

        $window.addEventListener('offline', function() {
          is_online = false;
        });
      }

      return new OfflineDb(remote_url, opts);
    };
  }
]);