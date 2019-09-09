# Jacks

## Pipeline

### Execute

Builds the current Pipeline `groovy` file/script you are editing on your remote Jenkins, using the name of the file as the name of the job the extension will reference.

If the job doesn't exist, the user will be presented with an option of creating the job on the remote host. If the job _does_ exist, it will update the job's pipeline script (nothing else) and run the build as usual.

The job's build output will stream to your editor's Output window with some syntax highlighting created specifically for generic Pipeline logs.

If parameters are added to the job on Jenkins, the extensions will add these to the `.<FILE>.config.json` file, which can be edited for executing your Pipeline with targeted paramter values.

### Update

Updates the remote Jenkins Pipeline job with the `groovy` file's source/script.

### Abort

Aborts a streaming pipeline build (if one is active).

### Shared Library Reference

Provies a searchable list of the available Pipeline Shared Library steps/vars. When a selection is made, the user will be presented with the markdown documentation of the step/var pulled and parsed from the remote Jenkins (no snippets currently).

## Script Console

### Execute

Executes the current `groovy` file/script, you are editing, on the remote jenkins, targeting either the System (e.g. Manage Jenkins Script Console) or multiple nodes/slaves/agents/etc.

## Build

### Download Log

Presents the user with a searchable list of Jenkins jobs retrieved from the remote server

Upon selection of a job, a list of build numbers for that job will be presented for selection. The selection of a build will then stream the output to the user's output channel.

### Delete

Presents the user with a searchable list of Jenkins jobs retrieved from the remote server. 
Upon selection of a job, a list of build numbers for that job will be presented for the user to select for deletion for the remote Jenkins.

## Job

Presents the user with a searchable list of jobs pulled from the remote jenkins which one more selections can be made to:

* __Disable__
* __Enable__
* __Delete__

## Node

Presents the user with a searchable list of nodes/agents pulled from the remote jenkins which one more selections can be made to:

* __Set Offline__
* __Set Online__
* __Disconnect__

## Host Selection

Brings up a quick pick of available Jenkins hosts to taget for connection.

Jenkins host connections should be added to your `settings.json` file under the following id:
```json
"jenkins-jack.jenkins.connections": [
    {
        "name": "localhost",
        "uri": "http://localhost:8080",
        "username": "drapplesauce",
        "password": "217287g126721687162f76f387fdsy7",
        "active": true
    }
]
```

You can navigate to this specific section in the by going to the Settings UI and typing in `Jenkins Jack` and setting `Jenkins Connections`.