Offline Database for Angular
----------------------------

Syncable offline first database

Status
------

[![CircleCI](https://circleci.com/gh/sparkgeo/ng-offlinedb/tree/develop.svg?style=svg)](https://circleci.com/gh/sparkgeo/ng-offlinedb/tree/develop)


Requirements
------------

- Angular (https://angularjs.org/)
- Dexie.js (http://dexie.org/)

Options
-------

* offlineDbName: Indexed db name
* offlineTableName: Table name, default: offlineDbName
* offlineDbPrimaryKey: Primary key name, default: 'id'
* offlineDbIndicies: (see: https://github.com/dfahlander/Dexie.js/wiki/Version.stores())
* offlineDbStructure: (see: https://github.com/dfahlander/Dexie.js/wiki/Table.mapToClass())


Example
-------

    gulp webserver


Navigate to: http://localhost:7777/example/