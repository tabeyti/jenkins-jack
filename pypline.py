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
  def run(self, edit, target_idx = -1):
    pypline.reload(self.view)

    # Grab the default commands from the Default.sublime-commands resource.
    data = json.loads(sublime.load_resource("Packages/Pypline/Default.sublime-commands"))
    command_names = [x['caption'] for x in data]

    if target_idx != -1:
      self.target_option_select(target_idx, edit)
    else:
      self.view.window().show_quick_panel(
        command_names,
        lambda idx: self.target_option_select(idx, edit))

  #------------------------------------------------------------------------------
  def target_option_select(self, index, edit):
    if index == -1: return
    if index == 0:
      sublime.set_timeout_async(lambda: pypline.start_pipeline_build(self.view), 0)
    elif index == 1:
      pypline.abort_active_build()
    elif index == 2:
      if pypline.open_browser_steps_api:
        pypline.open_browser_at("{}/pipeline-syntax".format(pypline.jenkins_uri))
      else:
        pypline.show_steps_api_search(self.view)
    elif index == 3:
      pypline.show_globalvars_api_search(self.view)
    elif index == 4:
      pypline.validate(self.view)
    elif index == 5:
      pypline.open_output_panel()
    elif index == 6:
      pypline.script_console_run(self.view)
    elif index == 7:
      pypline.ask_job_name(self.view)
    elif index == 8:
      pypline.start_pipeline_update(self.view)

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