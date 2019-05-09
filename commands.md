# Commands

## Pipeline

### Execute
Builds the current Pipeline `groovy` file/script you are editing on your remote Jenkins, using the name of the file as the name of the job the extension will reference.

If the job doesn't exist, the user will be presented with an option of creating the job on the remote host. If the job _does_ exist, it will update the job's pipeline script (nothing else) and run the build as usual.

The job's build output will stream to your editor's Output window with some syntax highlighting created specifically for generic Pipeline logs.

### Abort
Aborts a streaming pipeline build (if one is active).

### Shared Library Reference

Provies a searchable list of the available Pipeline Shared Library steps/vars. When a selection is made, the user will be presented with the markdown documentation of the step/var pulled and parsed from the remote Jenkins (no snippets currently).

## Script Console

### Execute

Executes the current `groovy` file/script you are editing on the remote jenkins, targeting either the System (e.g. Manage Jenkins Script Console) or N number of nodes/slaves/agents/etc.

## Build Log

### Download

Presents the user with a searchable list of Jenkins jobs retrieved from the remote server. Upon selection of a job, a list of build numbers for that job will be presented for selection. The selection of a build will then stream the output to the user's Output panel.