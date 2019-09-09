# Change Log
All notable changes to the "jenkins-jack" extension will be documented in this file.

## 0.1.5

* __Job Jack:__ Execute disable, enable, and delete operations on one or more targeted jobs.
* __Node Jack:__ Execute set-online, set-offline, and disconnect operations on one or more targeted nodes.
* __Build Jack:__ Stream syntax higlighted build logs or delete one or more builds from a targeted job.

Fixed
* Default host connection now populates with default values properly
* Fixed conditional logic for retrieving build numbers via jenkins url

## 0.1.4

* __Multiple Host Connection Support:__ Now supports multiple Jenkins host connections and the ability to swap between hosts (`ctrl+shift+j -> Host Selection`)
    
    __NOTE:__ Additional hosts are added via `settings.json` which can be found in Settings by typing `Jenkins Jack`.

* __Build Parameter Support for Pipeline Exection:__ Groovy files used for Pipeline execution now support parameters via a config file: `<FILE>.conf.json`. Config file will be created automatically if one doesn't exist for a groovy file.

* __Disabling Strict TLS:__ An option in Settings has been added to disable TLS checks for `https` enpoints that don't have a valid cert.

* __Better Jenkins URI Parsing:__ Now supports prefixed (`http`/`https`) URIs.

* __Progress Indicators Support Cancellation:__ Progress indicators now actually support canceling during pipeline execution, script console execution, or build log downloads.

### Fixed

* __Snippets Refresh Fix__: When host information is changed, snippets will now update GDSL global shared library definitions correctly without a need for restarting the editor.

## 0.1.3

### Fixed
- Broken `.pipeline` command in `packages.json`
- Create job hang for Pipeline fixed; better error handling.

## 0.1.2

Fixed

- Snippets configuration now work

## 0.1.1
- Initial release