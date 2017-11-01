# Pypline

Sublime Text 3 plugin for developing and running Jenkins Pipeline scripts locally.

## Features

- Remote builds: Remotely build a Jenkins pipeline scripts and stream the output to Sublime console.
- Step API: Diplay a list of the available Pipeline API steps, coupled with snippet generation.

## Installation
As of now, installation is handled by cloning the repo in your Sublime Packages directory. Yep.

## Setup
Pypline works by hooking into the user's running Jenkins instance. Before you can use the plugin, you must fill in the 'Jenkins Configuration' section of the `.sublime-settings` file (`Pypline->Settings-Default`).

## Use

To access available commands:
- (Windows/Linux): `ctrl+shift+j`
- (OSX): `super+shift+j`

There are currently two commands are provided

### Pypline: Execute
Builds the Jenkins Pipeline script remotely.
If the job doesn't exist, a pipeline job will be created for you. If the job _does_ exist, it will just update the job's pipeline script (nothing else).

By default, the job's build output will stream to your Sublime's console window. If you would rather view the output via browser, set the configuration flag `open_browser_build` to `true` and a this command will open a page to your build's console output.

### Pypline: Steps API

By default, a searchable list of the available Pipeline steps will be provided to the user. On selection of a step, skeleton/snippet of the step will be pooped at the user's cursor position.

If you would rather just view the Pipeline steps via browser, set the configuration flag `open_browser_api` to `true` and this command will open a page to your Jenkins' Pipeline Snippet Generator page.

## Support
Do you have a feature request or would like to report a bug? Super duper! Create an issue via github's [issue tracker](https://github.com/tabeyti/pypline/issues). 

Currently, there are no hard guidelines defined for feature requests, bugs, or questions since the project is relatively new. These will become more defined as interest in the project increases.

## Authors

* **Travis Abeyti** - *Initial work*

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details. Do what you will with this.