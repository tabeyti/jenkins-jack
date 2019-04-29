# Pypline

VSCode extension for developing and running Jenkins Pipeline scripts locally.

## Features

- **Remote pipeline builds**: Remotely build a Jenkins pipeline scripts from an open `groovy` file and stream the output to the output console.
- **Pipeline step auto-completion**: Auto-completion of pipeline steps for snippet generation of the step call and parameters.
- And much more!

## Packaging and Installation
Currently not on the marketplace. To create a standalone `vsix` for installation locally, run the following commands:
```bash
# From the root of the extension.
npm install -g vsce # For packaging
npm install # Install dependencies.
vsce package # Bake some bread.
code --install-extension .\pypline-0.0.1.vsix # ...or whatever version was built
```

## Setup
Pypline works by hooking into the user's running Jenkins instance via the Jenkins Remote API. Before you can use the plugin, you must fill in the extension settings to point to your remote Jenkins host/server.

## Use

To access the invokable commands:
- (Windows/Linux): `ctrl+alt+j`
- (OSX): `super+alt+j`

Snippet generation activates on viewing a `groovy` file.

## Primary Commands

Navigate [here](./commands.md) for a list of primary commands this tool supports.

## Support
Do you have a feature request or would like to report a bug? Super duper! Create an issue via github's [issue tracker](https://github.com/tabeyti/pypline/issues).

Currently, there are no hard guidelines defined for feature requests, bugs, or questions since the project is relatively new. These will become more defined as interest in the project increases.

## Authors

* **Travis Abeyti** - *Initial work*

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details. Do what you will with this.