kodi-sync-watched-flag
===============

Syncs bunch of old XBMC/Kodi backups with your decentral mySQL/mariaDB Kodi database.

I used this once to sync my old OpenELEC backups with my corrent database and hope that this is useful for someone else 😊

## Install

```
$ npm install
```

## Usage
```sh
$ node index.js --dir "/directory/with/old/xbmc/backups" --host [IP/URL of your server] --user [default: kodi]  --password [default: kodi] --database [default: MyVideos90]
```