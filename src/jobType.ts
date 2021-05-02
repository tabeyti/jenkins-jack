export enum JobType {
    Default = 'default',
    Pipeline = 'pipeline',
    Multi = 'multibranch',
    Org = 'org',
    Folder = 'folder'
}

export class JobTypeUtil {
    public static classNameToType(classStr: string): JobType {
        switch(classStr) {
            case 'com.cloudbees.hudson.plugins.folder.Folder':
            case 'com.cloudbees.opscenter.bluesteel.folder.BlueSteelTeamFolder': {
                return JobType.Folder;
            }
            case 'org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject': {
                return JobType.Multi;
                break;
            }
            case 'jenkins.branch.OrganizationFolder': {
                return JobType.Org;
            }
            case 'org.jenkinsci.plugins.workflow.job.WorkflowJob': {
                return JobType.Pipeline;
            }
            default: {
                return JobType.Default;
            }
        }
    };
}