Offline Database for Angular
----------------------------

Syncable offline first database


Requirements
------------

- Angular (https://angularjs.org/)
- Dexie.js (http://dexie.org/)

Options
-------

* offlineDbName: Indexed db name
* offlineDbVersion: default: 1
* offlineTableName: Table name, default: offlineDbName
* offlineDbPrimaryKey: Primary key name, default: 'id'
* offlineDbIndicies: (see: https://github.com/dfahlander/Dexie.js/wiki/Version.stores())
* offlineDbStructure: (see: https://github.com/dfahlander/Dexie.js/wiki/Table.mapToClass())
