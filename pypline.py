
# https://github.com/packagecontrol/requests
# https://stackoverflow.com/questions/38137760/jenkins-rest-api-create-job

import sublime
import sublime_plugin

import os
import sys
import pprint
import requests
import tempfile
import subprocess
import ntpath
import re

from xml import etree
from time import sleep
from xml.sax.saxutils import escape

############################################################################
# Core class (whatever that means in this instance).
############################################################################
class Pypline:

  DEBUG_ENABLED =             True

  settings =                  None
  jenkins_uri =               ""
  username =                  ""
  api_token =                 ""
  job_prefix =                "" 
  open_browser_build_output = False
  open_browser_steps_api =    False
  autocompletion_enabled =    True
  timeout_secs =              20
  auth_tuple =                None
  auth_crumb =                None

  filename =                  "empty"
  output_panel =              None
  pipeline_steps_api =        None  

  def load_settings(self, settings):
    self.settings =       settings
    print("SETTINGS: {}".format(self.settings))
    self.jenkins_uri =    self.settings.get("jenkins_uri", "http://127.0.0.1:8080")
    print("STUFF: ".format(self.jenkins_uri))
    self.username =       self.settings.get("username", None)
    self.api_token =      self.settings.get("password", None)
    self.job_prefix =     self.settings.get("job_prefix", "temp")
    self.timeout_secs =   self.settings.get("open_browser_timeout_secs", 10)
    self.auth_tuple =     (self.username, self.api_token)
    self.open_browser_build_output =    self.settings.get("open_browser_build_output", False)
    self.open_browser_steps_api =       self.settings.get("open_browser_steps_api", False)
    self.autocompletion_enabled =       self.settings.get("autocompletion_enabled", True)


  def open_output_panel(self):
    self.output_panel = sublime.active_window().create_output_panel(self.filename)
    self.output_panel.run_command("select_all")
    self.output_panel.run_command("right_delete")
    self.output_panel.set_read_only(False)
    self.output_panel.set_syntax_file("Packages/Text/Plain Text.tmLanguage")
    sublime.active_window().run_command("show_panel", {"panel": "output.{}".format(self.filename)})

  ############################################################################
  # Starts the flow for remotely building a Jenkins pipeline job,
  # using the user's view contents as the pipeline script.
  #
  def start_pipeline_build(self, view):

    # Create/retrieve/show our output panel and clear the contents.
    self.open_output_panel();

    # Grab file name (to be used for jenkins job update/create)
    self.filename = ntpath.basename(view.file_name())
    if "." in self.filename:
      self.filename = os.path.splitext(self.filename)[0]

    # Retrieve jenkins authentication crumb (CSRF token) to make requests remotely.
    # TODO: CSRF crumb support for console output is not supported yet.
    self.get_auth_crumb()
    content = view.substr(sublime.Region(0, view.size()))
    self.build_pipeline(content, self.filename)

  def open_output_panel(self):
    self.output_panel = sublime.active_window().create_output_panel(self.filename)
    self.output_panel.run_command("select_all")
    self.output_panel.run_command("right_delete")
    self.output_panel.set_read_only(False)
    self.output_panel.set_syntax_file("Packages/Text/Plain Text.tmLanguage")
    sublime.active_window().run_command("show_panel", {"panel": "output.{}".format(self.filename)})

  #############################################################################
  # Logging Methods
  #

  def OUT(self, message):
    self.output_panel.run_command("append", {"characters": "{}\n".format(message), "scroll_to_end": True})
    # self.output_panel.add_regions("ham", [self.output_panel.visible_region()], "string", "", 0)

  def MYPRINT(self, label, message):
    print("[{}] - {}".format(label, message))
    self.OUT("[{}] - {}".format(label, message))
    
  def DEBUG(self, message):
    if self.DEBUG_ENABLED: print("[DEBUG] - {}".format(message))

  def INFO(self, message):
    self.MYPRINT("INFO", message)

  def WARNING(self, message):
    self.MYPRINT("WARNING", message)

  def ERROR(self, message):
    self.MYPRINT("ERROR", message)

  #############################################################################
  # Request Methods
  #

  def get_request_headers(self):
    if not self.auth_crumb:
      return {'Content-Type':'text/xml'}
    return {'Content-Type':'text/xml', self.auth_crumb[0]:self.auth_crumb[1]}

  def get_auth_crumb(self):
    url = "http://{}:{}@{}//crumbIssuer/api/json".format(
      self.username,
      self.api_token,
      self.jenkins_uri.replace("http://", ""))

    self.INFO("GET: {}".format(url))     
    r = requests.get(url)      
    if r.status_code != requests.codes.ok:
      self.WARNING("GET: {} - Could not retrieve 'crumb' for authentication - Status code {}".format(
      url,  r.status_code))
      return None
    
    data = json.loads(r.text)
    self.auth_crumb = (data["crumbRequestField"], data["crumb"])
    self.INFO("Crumb retrieved - {}:{}".format(self.auth_crumb[0], self.auth_crumb[1]))

  def open_browser_at(self, url):
    if sys.platform=='win32':
      os.startfile(url)
    elif sys.platform=='darwin':
      subprocess.Popen(['open', url])
    else:
      try:
        subprocess.Popen(['xdg-open', url])
      except:
        self.INFO('Please open a browser on: ' + url)

  def job_exists(self, jobname):
    url = "{}/job/{}".format(self.jenkins_uri, jobname)
    self.INFO("GET: {}".format(url))
    r = requests.get(url, auth=self.auth_tuple)
    if r.status_code == requests.codes.ok:
      return True 
    return False

  def get_job_config(self, jobname):
    url = "{}/job/{}/config.xml".format(self.jenkins_uri, jobname)
    self.INFO("GET: {}".format(url))
    r = requests.get(url, auth=self.auth_tuple)
    if r.status_code == requests.codes.ok:
      return r.text
    self.ERROR("GET: {} - Status Code: {}".format(url, r.status_code))
    return None

  def update_job(self, jobname, content):
    url = "{}/job/{}/config.xml".format(self.jenkins_uri, jobname)

    self.INFO("POST: {}".format(url)) 
    r = requests.post(
      url, 
      data = content,
      headers=self.get_request_headers(),
      auth=self.auth_tuple)

    if r.status_code == requests.codes.ok:
      return r.text + "."
    self.ERROR("POST: {} - Could not update job {} - Status code {}".format(
      url, jobname, r.status_code))
    return None
    
  def create_job(self, jobname, content):
    url = "{}/createItem?name={}".format(self.jenkins_uri, jobname)

    self.INFO("POST: {}".format(url))     
    r = requests.post(
      url, 
      data = content,
      headers=self.get_request_headers(),
      auth=self.auth_tuple)

    if r.status_code == requests.codes.ok:
      return r.text + "."
    self.ERROR("POST: {} - Could not create job {} - Status code {} - {}".format(
      url, jobname, r.status_code, r.text))
    return None

  def next_buildnum(self, jobname):
    url = "{}/job/{}/lastBuild/buildNumber".format(self.jenkins_uri, jobname)

    self.INFO("GET: {}".format(url))
    r = requests.get(
      url,
      headers=self.get_request_headers())    

    if r.status_code != requests.codes.ok:
      self.WARNING("GET: {} - Issue retrieving build number for job {} - Status code: {} - {}".format(
        url, jobname, r.status_code, r.text))
      self.WARNING("Defaulting build number to 1.")
      return 1
    return int(r.text) + 1

  def build_job(self, jobname):
    url = "{}/job/{}/build".format(self.jenkins_uri, jobname)

    self.INFO("POST: {}".format(url))
    r = requests.post(
      url, 
      auth=self.auth_tuple,
      headers=self.get_request_headers())

    if r.status_code == requests.codes.ok or r.status_code == 201:
      return r.text + "."
    self.ERROR("POST: {} - Could not build job {} - Status code {}".format(
      url, jobname, r.status_code))
    return None

  def build_ready(self, build_url):
    timeout = self.timeout_secs
    while timeout > 0:
      r = requests.get(build_url)
      if r.status_code == requests.codes.ok:
        return True
      self.INFO("Build not ready. Waiting...")
      sleep(1)
      timeout = timeout - 1

    self.ERROR("Timed out at {} secs waiting for build at {}".format(self.timeout_secs, build_url))    
    return False

  #############################################################################
  # Remotely builds the passed Jenkins Pipeline source.
  # Pipeline source is inserted into a template 'config.xml' and then
  # remotely determines whether job exists and needs to be updated,
  # or job doesn't exist and needs to be created.
  # 
  def build_pipeline(self, source, job): 

    content = ""
    xmlpath = os.path.join(sublime.packages_path(), "pypline")
    with open('{}/config.xml'.format(xmlpath), 'r') as myfile:
      content = myfile.read().replace('\n', '')
    config = content.replace("++CONTENT++", source)

    # If job exists, update. If not, create.
    jobname = job
    if len(self.job_prefix.strip()) != 0:
      jobname = self.job_prefix + "-" +  job

    next_build_number = 1
    if not self.job_exists(jobname):
      self.INFO("{} doesn't exist. Creating...".format(jobname))
      if not self.create_job(jobname, config): return
    else:
      self.INFO("{} already exists. Reconfiguring...".format(jobname))
      uj = self.update_job(jobname, config)
      if not uj:
        self.INFO(uj)
        return
      next_build_number = self.next_buildnum(jobname)

    # Start build, create build URL, and wait for build to begin.
    if not self.build_job(jobname): return
    build_url = "{}/job/{}/{}".format(self.jenkins_uri, jobname, next_build_number)
    self.INFO("Build started for '{}' at {}".format(jobname, build_url))

    # Wait for build to start.
    if not self.build_ready(build_url): return

    # Stream output to Sublime console or open browser to output.
    if self.open_browser_build_output:
      self.INFO("Opening browser to console output.")
      self.open_browser_at("{}/console".format(build_url))
    else:
      # Print build output to console if specified.
      self.INFO("Streaming build output.")
      self.console_output(jobname, next_build_number)

  #############################################################################
  # Streams the build's output via Jenkins' progressiveText by keeping an 
  # open session with the API, and writing out content as it comes in. The 
  # method will return once the build is complete, which is determined
  # via Jenkins API.
  # 
  def console_output(self, jobname, buildnumber):
    # Get job console till job stops
    job_url = self.jenkins_uri + "/job/" + jobname + "/" + str(buildnumber) + "/logText/progressiveText"
    self.INFO("-------------------------------------------------------------------------------")
    self.INFO("Getting Console output {}".format(job_url))
    self.INFO("-------------------------------------------------------------------------------\n")
    start_at = 0
    stream_open = True
    check_job_status = 0

    console_requests = requests.session()
    
    while stream_open:

      console_response = console_requests.post(
        job_url,
        data={'start': start_at })

      content_length = int(console_response.headers.get("Content-Length",-1))

      if console_response.status_code != 200:
        self.ERROR("Error getting console output. Status code: {}".format(console_response.status_code))
        self.ERROR(console_response.content)
        self.ERROR(console_response.headers)
        return

      if content_length == 0:
        sleep(1)
        check_job_status +=1
      else:
        check_job_status = 0

        # Print to output panel.
        content = str(console_response.content, 'ascii')
        for line in content.replace("\\t", "\t").split("\r\n"):
          self.OUT("{}".format(line))

        sleep(1)

        start_at = int(console_response.headers.get("X-Text-Size"))

      # No content for a while lets check if job is still running
      if check_job_status > 1:

        job_status_url = self.jenkins_uri + "/job/" + jobname + "/" + str(buildnumber) + "/api/json"
        job_requests = requests.get(
          job_status_url,
          headers=self.get_request_headers())

        job_bulding= job_requests.json().get("building")
        if not job_bulding:
          # We are done
          self.INFO("Console stream ended.")
          stream_open = False
        else:
          # Job is still running
          check_job_status = 0
  
    self.complete = True
    self.INFO("-------------------------------------------------------------------------------")

  #############################################################################
  # Generates the list of Pipeline steps by parsing the output from the
  # 'pipeline-syntax/gdsl' endpoint. Would be nice if there was a library for
  # parsing this, but some poorly written regex will do just nicely...
  # 
  def refresh_pipline_api(self):
    url = "{}/pipeline-syntax/gdsl".format(self.jenkins_uri)
    r = requests.get(url, verify=False)
    
    data = []
    self.pipeline_steps_api = []

    # Grab method lines from GDSL text.
    for line in r.text.split("\n"):
      if "method(name:" in line: 
        m = re.match("method\((.*?)\)", line)
        if not m: continue

        step = self.parse_method_line(line)

        if step != None and not any(p.name == step.name for p in self.pipeline_steps_api):
          self.pipeline_steps_api.append(step)
    
    # Sort by step name.
    self.pipeline_steps_api.sort(key=lambda x: x.name)

  def parse_method_line(self, line):

    name = ""
    doc = ""
    params = {}

    # First method signature.
    m = re.match("method\(name:\s+'(.*?)',.* params: \[(.*?)],.* doc:\s+'(.*)'", line)
    if m:
      name = m.group(1) 
      doc = m.group(3)

      # Parse step parameters.
      params = {} 
      for p in m.group(2).split(", "):
        pcomps = p.split(":")
        if (pcomps[0] == ""): continue
        params[pcomps[0]] = pcomps[1].replace("'", "").strip()

    else:
      m = re.match("method\(name:\s+'(.*?)',.*namedParams: \[(.*?)\],.* doc:\s+'(.*)'", line)
      if not m: return None

      name = m.group(1)
      doc = m.group(3)

      rawParams = m.group(2).split(", parameter")

      for rp in rawParams:
        tm = re.match(".*name:\s+'(.*?)', type:\s+'(.*?)'.*", rp)
        if not tm: continue
        params[tm.group(1)] = tm.group(2)

    self.DEBUG("Parsed name: {} - doc: {}".format(name, doc))
    s = PipelineStepDoc()
    s.name = name
    s.doc = doc
    s.param_map = params 
    return s

  #############################################################################
  #  Shows the available Pipeline steps API via Sublime's quick panel.
  # 
  def show_steps_api_search(self, view):
    self.refresh_pipline_api()
    api_list = ["{}: {}".format(p.name, p.doc) for p in self.pipeline_steps_api]    

    view.window().show_quick_panel(api_list, 
      lambda idx: self.show_steps_api_search_on_chosen(view, idx))

  #############################################################################
  # Handles a search selection from show_steps_api_search
  # 
  def show_steps_api_search_on_chosen(self, view, idx):
    if idx <= 0: return
    step = self.pipeline_steps_api[idx]
    view.run_command("insert_snippet", { "contents": step.get_snippet() })


# Time to get lazy. Time to get crazy. It's singleton time, baby.
pypline = Pypline()

class PyplineCommand(sublime_plugin.TextCommand):
  
  def run(self, edit, target_idx = -1):
    
    settings =       sublime.load_settings("pypline.sublime-settings")
    pypline.load_settings(settings)

    # Determine command target.
    if target_idx != -1:
      self.target_option_select(target_idx, edit)
    else:
      self.view.window().show_quick_panel([
        "Pypline: Execute",
        "Pypline: Steps API"
      ], lambda idx: self.target_option_select(idx, edit))

  def target_option_select(self, index, edit):
    if index == -1: return
    if index == 0:
      sublime.set_timeout_async(lambda: pypline.start_pipeline_build(self.view), 0)
    elif index == 1:
      if pypline.open_browser_steps_api:
        pypline.open_browser_at("{}/pipeline-syntax".format(self.jenkins_uri))
      else:
        pypline.show_steps_api_search(self.view)

###############################################################################
# Event class for handling Jenkins Pipeline auto-completions.
###############################################################################

class PyplineCompletions(sublime_plugin.EventListener):

  def on_query_completions(self, view, prefix, locations):
    if not is_groovy_view(view, locations) or not pypline.autocompletion_enabled: 
      return ([], 0)

    completions = self.get_completions()
    return (completions, sublime.INHIBIT_EXPLICIT_COMPLETIONS)

  def get_completions(self):
    if pypline.pipeline_steps_api == None: 
      pypline.refresh_pipline_api()

    completions = []
    for step in pypline.pipeline_steps_api:
      completions.append(("{}\t{}\tPypline".format(step.name, step.get_signature()), step.get_snippet()))
    return completions
 
###############################################################################
# Model for storing Pipeline step meta-data.
###############################################################################
class PipelineStepDoc:
  name =        ""
  doc =         ""
  param_map =   {}

  def get_snippet(self):
    p = [] 
    for key in sorted(self.param_map):
      value = self.param_default_value(self.param_map[key])
      p.append("{}:{}".format(key, value))
    return "{} {}".format(self.name, ", ".join(p))

  def get_signature(self):
    p = [] 
    for key in sorted(self.param_map):
      p.append("{}:{}".format(key, self.param_map[key]))
    return "{}({})".format(self.name, ", ".join(p))

  def param_default_value(self, param):
    if param == "java.lang.String":
      return "\"\""
    if param == "Closure":
      return "\{\}"
    if param == "Map":
      return "[:]"
    if param == "int":
      return "0"
    if param == "boolean":
      return "true"
    else:
      return "[unknown_param]"


###############################################################################
# Global (static ?) methods.
#

def is_groovy_view(view, locations = None):
    return (
      (view.file_name() and is_groovy_file(view.file_name())) or 
      ('Groovy' in view.settings().get('syntax')) or 
      ( locations and len(locations) and '.groovy' in view.scope_name(locations[0])))

def is_groovy_file(file):
  return file and file.endswith('.groovy')