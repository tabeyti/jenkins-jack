import * as htmlParser from 'cheerio';
import { JenkinsService } from './JenkinsService';

export class SharedLibVar {
    label: string;
    description?: string;
    descriptionHtml?: string;

    /**
     * Constructor.
     * @param name The name of the definition.
     * @param description The description.
     * @param descriptionHtml The html of the description.
     */
    constructor(name: string, description: string, descriptionHtml: string) {
        this.label = name;
        this.description = description;
        this.descriptionHtml = descriptionHtml;
    }
}

export class SharedLibApiManager {
    public sharedLibVars: SharedLibVar[];
    private jenkins: JenkinsService;

    private static sharedLibInstance: SharedLibApiManager;

    private constructor() {
        this.sharedLibVars = [];
        this.jenkins = JenkinsService.instance();
    }

    public static instance() {
        if (undefined === SharedLibApiManager.sharedLibInstance) {
            SharedLibApiManager.sharedLibInstance = new SharedLibApiManager();
        }
        return SharedLibApiManager.sharedLibInstance;
    }

    /**
     * Retrieves/parses Shared Library/Global Variable definitions.
     * @param job Optional job to retrieve global-vars/shared-library from.
     * E.g. <root>/pipeline-syntax/globals vs. <root>/job/somejob/pipeline-syntax/globals
     */
    public async refresh(job: string | undefined = undefined) {
        let url = undefined !== job ?   `job/${job}/pipeline-syntax/globals` :
                                        'pipeline-syntax/globals';
        
        let html: string = await this.jenkins.get(url);
        if (undefined === html) { return; }        
        
        this.sharedLibVars = this.parseHtml(html);
        return this.sharedLibVars;
    }

    /**
     * Parses the html of the Global Variables/Shared Library page for 
     * definitions.
     * @param html The Shared Library/Global Variables html as a string.
     */
    private parseHtml(html: string) {
        const root = htmlParser.load(html);
        let doc = root('.steps.variables.root').first();

        let sharedLibVars: any[] = []
        let child = doc.find('dt').first();
        while (0 < child.length) {
            // Grab name, description, and html for the shared var.
            let name = child.attr('id');
            let descr = child.next('dd').find('div').first().text().trim();
            let html = child.next('dd').find('div').first().html();
            if (null === descr || null === html) { continue; }

            // Add shared var name as title to the content.
            html = `<div id='outer' markdown='1'><h2>${name}</h2>${html}</div>`;
            if (!sharedLibVars.some((slv: SharedLibVar) => slv.label === name)) {
                sharedLibVars.push(new SharedLibVar(name, descr, html));
            }

            // Get the next shared var.
            child = child.next('dd').next('dt');
        }
        return sharedLibVars;
    }
}