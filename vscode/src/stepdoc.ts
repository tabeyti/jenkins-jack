export class PipelineStepDoc {
    name: string;
    doc: string;
    params: Map<string, string>;

    /**
     * Constructor.
     * @param name The name of the step.
     * @param doc The documentation for the step.
     * @param params A map of key/value pairs representing
     * the name of the parameter and it's type, repsectively.
     */
    constructor(name: string, doc: string, params: Map<string, string>) {
        this.name = name;
        this.doc = doc;
        this.params = params;
    }

    /**
     * Returns the snippet method skeleton string for this step.
     */
    public getSnippet() {
        let p = new Array<string>();
        this.params.forEach((value: string, key: string) => {
            value = this.paramDefaultValue(value);
            p.push(`${key}: ${value}`);
        });
        return `${this.name} ${p.join(', ')}`;
    }

    /**
     * Returns the method signature string for this step.
     * Used in snippets 'describe'.
     */
    public getSignature() {
        let p = Array<string>();
        this.params.forEach((value: string, key: string) => {
            p.push(`${key}: ${value}`);
        });
        return `${this.name}(${p.join(', ')})`;
    }

    private paramDefaultValue(param: string) {
        param = param.replace("'", "");
        switch(param) {
            case "java.lang.String":
                return "\"\"";
            case "Closure":
                return "\{\}";
            case "Map":
                return "[:]";
            case "java.lang.Integer":
            case "int":
                return "0";
            case "boolean":
                return "true";
            case "java.lang.Object":
                return "null";
            default:
                return "[unknown_param]";
        }
    }
}