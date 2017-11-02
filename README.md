# Pypline

Sublime Text 3 plugin for developing and running Jenkins Pipeline scripts locally.

## Features

- **Remote pipeline builds**: Remotely build a Jenkins pipeline scripts and stream the output to Sublime console.
- **Pipeline step auto-completion**: Auto-completion of pipeline steps for snippet generation of the step call and parameters.
- **Pipeline step API viewer**: Display a searchable list of the available Pipeline API steps, with each step containing a short description of what it does.

## Installation
As of now, installation is handled by cloning the repo in your Sublime Packages directory. Yep.

## Setup
Pypline works by hooking into the user's running Jenkins instance via the Jenkins Remote API. Before you can use the plugin, you must fill in the 'Jenkins Configuration' section of the `.sublime-settings` file (`Pypline->Settings-Default`).

## Use

To access the invokable commands:
- (Windows/Linux): `ctrl+shift+j`
- (OSX): `super+shift+j`

There are currently two commands to select from:

#### Pypline: Execute
Builds the current Jenkins Pipeline script you are working on remotely.
If the job doesn't exist, a pipeline job will be created for you. If the job _does_ exist, it will just update the job's pipeline script (nothing else).

By default, the job's build output will stream to your Sublime's console window. If you would rather view the output via browser, set the configuration flag `open_browser_build` to `true` and a this command will open a page to your build's console output.

#### Pypline: Steps API

A searchable list of the available Pipeline steps will be provided to the user, with each step containing a short description of what it does. On selection of a step, a snippet of the step's call signature will be pooped out fer ya.

This command has an alternative option. If you would rather just view the Pipeline steps via browser, set the configuration flag `open_browser_api` to `true` and this command will then open your browser to your Jenkins' Pipeline Snippet Generator page.

## Support
Do you have a feature request or would like to report a bug? Super duper! Create an issue via github's [issue tracker](https://github.com/tabeyti/pypline/issues). 

Currently, there are no hard guidelines defined for feature requests, bugs, or questions since the project is relatively new. These will become more defined as interest in the project increases.

## Authors

* **Travis Abeyti** - *Initial work*

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details. Do what you will with this.