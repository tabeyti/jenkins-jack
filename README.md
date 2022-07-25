![logo](images/doc/demo.gif)

# Jenkins Jack

Are you tired of bloated extensions with superfluous features that are so confusing to use, you'd rather do everything manually?

I'm not!

Jack into your Jenkins to streamline your Pipeline development and Jenkins management. Execute Pipeline scripts remotely with real-time syntax highlighted output, access Pipeline step auto-completions, pull Pipeline step documentation, run console groovy scripts across multiple agents, manage jobs/builds/agents, and more!

Honestly, not that much more.

## Features

* Pipeline Jack
    * Execute (with build parameters)
        * Stream syntax highlighted output to output channel
    * Abort executed pipeline
    * Update target pipeline job on host with script
    * Shared Library reference docs
* Script Console Jack
    * Execute groovy console script at the System level or across one or more agents
* Node (agent) Jack
    * Disable (with an offline message), enable, or disconnect one or more nodes
    * Update the labels on one more more nodes
    * Open agent in web browser
* Job Jack
    * Disable, enable, delete, or view one or more jobs
    * Open job in web browser
    * Build job
* Build Jack
    * Download a build log
    * Download a build's replay script
    * Delete one or more builds
    * Open build in web browser
* Add, delete, edit, and select Jenkins host connections
* Pipeline (GDSL) auto-completions for `groovy` files
* Tree Views
    * Connection Tree
        * Add, edit, delete, and select your Jenkins host connections here
    * Pipeline Tree
        * Manage local scripts in relation to jobs on the targeted host
        * Pull job script from host
        * Pull replay script from build on host
        * Re-open your pulled script; association saved in `settings.json`
    * Job Tree
        * View jobs and builds on the host
        * Disable, enable, delete jobs and builds on the targeted host
    * Node (agent) Tree
        * View nodes on the host
        * Disable (with offline message), enable, disconnect nodes on the targeted host
        * Update one or more nodes labels

## Jacks!

See [COMMANDS.md](COMMANDS.md) for a more comprehensive list of commands and their use.

|Jack|Description|Command|
|---|---|:---|
|__Pipeline__|Remotely execute/abort/update Jenkins pipeline scripts from an open file with Groovy language id set, streaming syntax highlighted logs to the output console.|`extension.jenkins-jack.pipeline`|
|__Script Console__|Remotely execute Console Groovy scripts through the Jenkins Script Console, targeting one or more agents.|`extension.jenkins-jack.scriptConsole`|
|__Build__|Delete/abort builds, stream logs, and pull Pipeline replay scripts from your Jenkins host.|`extension.jenkins-jack.build`|
|__Job__|Disable/enable/delete one or more jobs from your remote Jenkins.|`extension.jenkins-jack.job`|
|__Node__|Disable/enable/disconnect one or more agents from your remote Jenkins. Mass update agent labels as well.|`extension.jenkins-jack.node`|

Individual jacks can be mapped to hot keys as user sees fit.

## Views

The extensions comes with UI/Views for interacting with all Jacks. The views can be found in the activity bar on the left hand side of the editor (bow icon):

![Views](images/doc/views.png)

All commands a user can execute via the quickpick command list (`ctrl+shift+j`) can also be executed in the Views via context menu or buttons.

For examples on interacting with the views, see [TUTORIAL.md](TUTORIAL.md).

## Auto-completions (faux snippets)

From the selected remote Jenkins, the extension will pull, parse, and provide Pipeline steps as auto-completions from the Pipeline step definitions (GDSL).

Any file in the editor with the Groovy language id set will have these completions (can be disabled via settings).

## Settings
<!-- settings-start -->

|Name |Description |
| --- | ---------- |
| `jenkins-jack.jenkins.connections` | List of jenkins connections to target when running commands. |
| `jenkins-jack.jenkins.strictTls` | If unchecked, the extension will **not** check certificate validity when connecting through HTTPS |
| `jenkins-jack.job.tree.numBuilds` | Number of builds to retrieve in the Job Tree view (NOTE: values over **100** will utilize the `allBuilds` field in the query, which may slow performance on the Jenkins server) |
| `jenkins-jack.outputView.panel.defaultViewColumn` | The default view column (location) in vscode the output panel will spawn on show. See https://code.visualstudio.com/api/references/vscode-api#ViewColumn |
| `jenkins-jack.outputView.suppressPipelineLog` | If enabled, hides `[Pipeline]` log lines in streamed output. |
| `jenkins-jack.outputView.type` | The output view for streamed logs |
| `jenkins-jack.pipeline.browserBuildOutput` | Show build output via browser instead of the `OUTPUT` channel |
| `jenkins-jack.pipeline.browserSharedLibraryRef` | Show Pipeline Shared Library documentation via browser instead of within vscode as markdown |
| `jenkins-jack.pipeline.params.enabled` | Enables the use of parameters (stored in '.myfile.config.json') to be used in your Pipeline execution |
| `jenkins-jack.pipeline.params.interactiveInput` | If true, will grab parameters from the remote jenkins job and prompt user for builder parameter input using input boxes and quick picks. |
| `jenkins-jack.pipeline.tree.items` | Remote jenkins job to local pipeline script associations |
| `jenkins-jack.snippets.enabled` | Enable Pipeline step snippets for supported languageIds |
| `jenkins-jack.tree.directorySeparator` | Directory separator string for job names in the Jenkins Jack TreeViews (default is `/`) |
<!-- settings-end -->

## Setup

See [TUTORIAL.md](TUTORIAL.md##setting-up-a-connection) for setup and basic usage.

## Quick-use

### `ctrl+shift+j`

Displays a list of all Jack commands provided by the extension (`extension.jenkins-jack.jacks`)

## Local Packaging and Installation
To create a standalone `vsix` for installation locally, run the following commands:
```bash
# From the root of the extension.
npm install -g vsce     # For packaging
npm install             # Install dependencies.
vsce package            # Bake some bread.
code --install-extension .\jenkins-jack-0.0.1.vsix # ...or whatever version was built
```

## Contributing
Do you have a feature request or would like to report a bug? Are you super motivated and want to submit a change? Do you think you're better than me? Most excellent!

Please see the [contribution guide](CONTRIBUTING.md) for more deets.

## Authors

* **Travis Abeyti** (*initial work*)

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details. Do what you will with this.
