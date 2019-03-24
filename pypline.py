# https://github.com/packagecontrol/requests
# https://stackoverflow.com/questions/38137760/jenkins-rest-api-create-job
# Progress indicator: https://stackoverflow.com/questions/36205245/progress-bar-in-sublime-text-with-python
import sublime
import sublime_plugin
from .core import *

# Time to get lazy. Time to get crazy.
# Just give in. It's singleton time, baby.
pypline = Pypline()

class PyplineCommand(sublime_plugin.TextCommand):
  """
  Class for the command entry point.
  """
  OPTIONS_PREFIX = '[+]'

  #------------------------------------------------------------------------------
  def run(self, edit, target=None):
    # Grab the default commands from the Default.sublime-commands resource.
    data = json.loads(sublime.load_resource("Packages/Pypline/Default.sublime-commands"))
    option_names = self.extract_option_names(data)

    if target is None:
      self.view.window().show_quick_panel(
        option_names,
        lambda idx: self.eval_option(idx, data)
        )

  #------------------------------------------------------------------------------
  def eval_option(self, idx, options):
    """
    Recursive function that either triggers a command if its a leaf,
    or displays a list of child options/commands to select.
    """
    if idx == -1 or options is None: return
    pypline.reload(self.view)
    option = options[idx]
    target = option['args']['target']

    if target == 'children' and len(option['children']) > 0:
      option_names = self.extract_option_names(option['children'])
      self.view.window().show_quick_panel(
        option_names,
        lambda idx: self.eval_option(idx, option['children'])
        )
    else:
      func = getattr(self, target)
      func()

  #------------------------------------------------------------------------------
  def extract_option_names(self, data):
    sorted(data, key=lambda i: len(i['children']) if 'children' in i else 0)
    return [
      '<{}>:  {}'.format(x['caption'], x['description']) if ('children' in x and len(x['children'])) <= 0
      else '{} {}'.format(self.OPTIONS_PREFIX, x['caption'])
      for x in data
    ]

  #------------------------------------------------------------------------------
  def pypline_execute(self):
    sublime.set_timeout_async(lambda: pypline.start_pipeline_build(self.view), 0)

  #------------------------------------------------------------------------------
  def pypline_abort(self):
    pypline.abort_active_build()

  #------------------------------------------------------------------------------
  def pypline_update(self):
    pypline.start_pipeline_update(self.view)

  #------------------------------------------------------------------------------
  def pypline_step_reference(self):
    if pypline.open_browser_steps_api:
        pypline.open_browser_at("{}/pipeline-syntax".format(pypline.jenkins_uri))
    else:
      pypline.show_steps_api_search(self.view)

  #------------------------------------------------------------------------------
  def pypline_global_vars_reference(self):
    pypline.show_globalvars_api_search(self.view)

  #------------------------------------------------------------------------------
  def pypline_validate_dec_pipeline(self):
    pypline.validate(self.view)

  #------------------------------------------------------------------------------
  def pypline_open_output_panel(self):
    pypline.open_output_panel()

  #------------------------------------------------------------------------------
  def jenkins_run_console_groovy_script(self):
    pypline.ask_node_name(self.view, True)

  #------------------------------------------------------------------------------
  def jenkins_job_download_build_log(self):
    pypline.ask_job_name(self.view)

  #------------------------------------------------------------------------------
  def jenkins_job_display(self):
    pypline.ask_job_name(self.view, True)

  #------------------------------------------------------------------------------
  def jenkins_node_display(self):
    pypline.ask_node_name(self.view)

  #------------------------------------------------------------------------------
  def jenkins_node_storage(self):
    pypline.display_node_storage(self.view)


#------------------------------------------------------------------------------
class PyplineCompletions(sublime_plugin.EventListener):
  """
  Event class for handling Jenkins Pipeline auto-completions.
  """

  #------------------------------------------------------------------------------
  def on_query_completions(self, view, prefix, locations):
    if not is_groovy_view(view, locations) or not pypline.snippets_enabled:
      return ([], 0)

    pypline.reload(view)
    completions = self.get_completions()
    return (completions, sublime.INHIBIT_EXPLICIT_COMPLETIONS)

  #------------------------------------------------------------------------------
  def get_completions(self):
    if pypline.pipeline_steps_api == None:
      pypline.refresh_pipeline_steps_api()

    completions = []
    for step in pypline.pipeline_steps_api:
      completions.append(("{}\t{}\tPypline".format(step.name, step.get_signature()), step.get_snippet()))
    return completions


#------------------------------------------------------------------------------
def is_groovy_view(view, locations = None):
  return (
    (view.file_name() and is_groovy_file(view.file_name())) or
    ('Groovy' in view.settings().get('syntax')) or
    ( locations and len(locations) and '.groovy' in view.scope_name(locations[0])))

#------------------------------------------------------------------------------
def is_groovy_file(file):
  return file and file.endswith('.groovy')