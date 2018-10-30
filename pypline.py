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
  #------------------------------------------------------------------------------
  def run(self, edit, target=None):

    # Grab the default commands from the Default.sublime-commands resource.
    data = json.loads(sublime.load_resource("Packages/Pypline/Default.sublime-commands"))
    command_names = [x['caption'] for x in data]
    command_targets = [x['args']['target'] for x in data]

    if target is None:
      self.view.window().show_quick_panel(
        command_names,
        lambda idx: self.target_option_select(idx, command_targets[idx], edit))

  def target_option_select(self, idx, target, edit):
    if idx == -1 or target is None: return

    pypline.reload(self.view)

    if target == "execute":
      sublime.set_timeout_async(lambda: pypline.start_pipeline_build(self.view), 0)
    elif target == "abort":
      pypline.abort_active_build()
    elif target == "step_reference":
      if pypline.open_browser_steps_api:
        pypline.open_browser_at("{}/pipeline-syntax".format(pypline.jenkins_uri))
      else:
        pypline.show_steps_api_search(self.view)
    elif target == "global_vars_reference":
      pypline.show_globalvars_api_search(self.view)
    elif target == "validate_dec_pipeline":
      pypline.validate(self.view)
    elif target == "open_output_panel":
      pypline.open_output_panel()
    elif target == "run_console_groovy_script":
      pypline.script_console_run(self.view)
    elif target == "download_build_log":
      pypline.ask_job_name(self.view)
    elif target == "update":
      pypline.start_pipeline_update(self.view)
    elif target == "job_display":
      pypline.ask_job_name(self.view, True)


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