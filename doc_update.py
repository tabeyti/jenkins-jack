import os
import sys
import json

def update_settings(readme):

    config_md = '''

|Name |Description |
| --- | ---------- |
'''

    with open('package.json') as f:
        data = json.loads(f.read())

    properties = data['contributes']['configuration'][0]['properties']
    for item in sorted (properties.keys()):
        config_md += '| `{}` | {} |\n'.format(item, properties[item]['markdownDescription'])

    md = readme[0:readme.index('<!-- settings-start -->')]
    md += '<!-- settings-start -->'
    md += config_md
    md += readme[-(len(readme) - readme.index('<!-- settings-end -->')):]

    return md


with open('README.md', 'r') as f: readme = f.read()
md = update_settings(readme)

with open('README.md', 'w') as f:
    f.write(md)