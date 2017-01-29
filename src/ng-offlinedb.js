/* globals angular, console, Dexie */
/* jshint strict: true */

// App Config Options
// ------------------

// * offlineDbName: Indexed db name
// * offlineTableName: Table name
// * offlineDbPrimaryKey: Primary key name, default: 'id'
// * offlineDbIndicies: (see: https://github.com/dfahlander/Dexie.js/wiki/Version.stores())
// * offlineDbStructure: (see: https://github.com/dfahlander/Dexie.js/wiki/Table.mapToClass())
// * offlineDbVersion: default: 1

angular.module('ng-offlinedb').factory('OfflineDb', [
  '$window',
  '$q',
  '$http',
  function(
    $window,
    $q,
    $http
  ) {
    'use strict';

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
      if (!remote_url.endsWith('/')) {
        remote_url = '/';
      }
      var is_online = navigator.onLine;

      var opts = options || {};
      opts.offlineDbName = dbname;
      opts.offlineTableName = offlineTableName || opts.offlineDbName;
      opts.offlineDbVersion = opts.offlineDbVersion || 1;
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
        self.db.version(opts.offlineDbVersion).stores(schema);

        function _get_resource_url(pk) {
          return self.remote_url + pk + '/';
        }

        function _save(data, synced, deleted) {
          synced = synced || false;
          deleted = deleted || false;
          data.$$synced = synced;
          data.$$deleted = deleted;
          return self.db.transaction('rw?', self.db[opts.offlineTableName], function() {
            return self.db[opts.offlineTableName].put(data).then(function () {
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

          if (action === 'post') {
            var r_record = angular.fromJson(angular.toJson(record));
            return $http.post(self.remote_url, r_record).then(function() {
              return _save(record, true);
            });
          }
          else if (action === 'put') {
            url = _get_resource_url(pk);
            // Strip 'system' properties
            var r_data = angular.fromJson(angular.toJson(record));
            return $http.put(url, r_data).then(function() {
              return _save(record, true);
            });
          }
          else if (action === 'delete') {
            url = _get_resource_url(pk);
            return $http.delete(url).then(function() {
              return _delete(pk);
            });
          }
        }

        self.query = function(qry_args) {
          var db = self.db[opts.offlineTableName];
          return db.toArray(function(arr) {
            return _.filter(arr, qry_args);
          });
        };

        self.get = function(pk) {
          return $q.when(self.db[opts.offlineTableName].get(pk, function(record) {
            return record;
          }));
        };

        self.create = function(record) {
          var rec;
          var pk = generateUuid();

          // Prep new record
          record[opts.offlineDbPrimaryKey] = pk;
          rec = _.extend({}, record);
          rec.$$synced = false;
          rec.$$deleted = false;

          return _save(rec).then(function() {
            if (!is_online) {
              console.log('[CREATE] Offline not remotely syncing');
              return $q.when(rec);
            }
            var r_record = angular.fromJson(angular.toJson(rec));
            return $http.post(self.remote_url, r_record).then(function() {
              return _save(rec, true);
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
          self.query({
            $$synced: false
          }).then(function(records) {
            console.log('Starting to sync %s records.', records.length);
            _.each(records, function(record) {
              record.remote_sync();
            });
          });
        }, false);

        $window.addEventListener('offline', function() {
          is_online = false;
        });
      }

      return new OfflineDb(remote_url, opts);
    };
  }
]);