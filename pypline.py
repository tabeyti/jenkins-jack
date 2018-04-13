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
import json
import datetime

# Local source imports.
from .models import PipelineStepDoc
from .models import PipelineVarDoc

# Dependency imports.
import mdpopups
from lxml import html
from bs4 import BeautifulSoup 
from xml import etree
from time import sleep
from xml.sax.saxutils import escape

STYLES = '''
#outer {
  border: 1px solid gray;
  background-color: #001435;
  padding: 10px;
}
pre {
    border: 1px solid #d8d8d8;
    padding: 5px;
    background-color: black;
    margin: 10px;
    display: flex;
}
'''

# **************************************************************************
# Core class (whatever that means in this instance).
# **************************************************************************
class Pypline:

  DEBUG_ENABLED =             True
  LOGGING_ENABLED =           True

  settings =                  None
  jenkins_uri =               ""
  username =                  ""
  api_token =                 ""
  job_prefix =                ""  
  open_browser_build_output = False
  open_browser_steps_api =    False
  snippets_enabled =          True
  timeout_secs =              20
  auth_tuple =                None
  auth_crumb =                None

  filename =                  "empty"
  output_panel =              None
  pipeline_steps_api =        None  
  pipeline_globalvars_api =   None
  existing_job =              None
  active_build_url =          None

  ############################################################################
  # Loads the settings....
  def load_settings(self, settings):
    self.settings =                       settings
    self.jenkins_uri =                    self.settings.get("jenkins_uri", "http://127.0.0.1:8080")
    self.username =                       self.settings.get("username", None)
    self.api_token =                      self.settings.get("password", None)
    self.job_prefix =                     self.settings.get("job_prefix", "")
    self.timeout_secs =                   self.settings.get("open_browser_timeout_secs", 10)
    self.open_browser_build_output =      self.settings.get("open_browser_build_output", False)
    self.open_browser_steps_api =         self.settings.get("open_browser_steps_api", False)
    self.snippets_enabled =               self.settings.get("snippets_enabled", True)

  ############################################################################
  # Reloads the Pypline object for use.
  def reload(self, view):
    if view is None or view.file_name() is None: return

    # Grab the view/file-name (to be used for jenkins job update/create)
    self.filename = ntpath.basename(view.file_name())
    if "." in self.filename:
      self.filename = os.path.splitext(self.filename)[0]

    settings = sublime.load_settings("pypline.sublime-settings")
    self.load_settings(settings)
    self.auth_tuple = (self.username, self.api_token)    

  ############################################################################
  # Prepares and opens the output panel celated to the active window.
  def reload_output_panel(self):
    self.output_panel = sublime.active_window().create_output_panel(self.filename)
    self.output_panel.run_command("select_all")
    self.output_panel.run_command("right_delete")
    self.output_panel.set_read_only(False)
    self.output_panel.set_syntax_file("Packages/Pypline/pypline-log-syntax.sublime-syntax")
    self.open_output_panel()

  def open_output_panel(self):
    sublime.active_window().run_command("show_panel", {"panel": "output.{}".format(self.filename)})

#<editor-fold desc="Loggin Methods">
  def OUT(self, message):
    if None == self.output_panel:
      self.reload_output_panel()
    self.output_panel.run_command("append", {"characters": message, "scroll_to_end": True})
    self.output_panel.run_command("move_to", {"to": "eof"})

  def OUT_LINE(self, message):
    self.OUT("{}\n".format(message))

  def MYPRINT(self, label, message):
    message = "[{}] {} >> {}".format(label, datetime.datetime.now().strftime("%H:%M:%S"), message)
    print(message)
    if label == "E": self.OUT_LINE(message)
    
  def DEBUG(self, message):
    if self.DEBUG_ENABLED:
      self.MYPRINT("D", message)

  def INFO(self, message):
    self.MYPRINT("I", message)

  def WARN(self, message):
    self.MYPRINT("W", message)

  def ERROR(self, message):
    self.MYPRINT("E", message)
#</editor-fold>

#<editor-fold desc="HTTP Request Methods for Jenkins">
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
      self.WARN("GET: {} - Could not retrieve 'crumb' for authentication - Status code {}".format(
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

  def get_pipeline_globalsvars_html(self):
    if self.existing_job is not None:
      url = "{}/job/{}/pipeline-syntax/globals".format(self.jenkins_uri, self.existing_job)
    else:
      url = "{}/pipeline-syntax/globals".format(self.jenkins_uri)
    self.INFO("GET: {}".format(url))
    r = requests.get(url, headers=self.get_request_headers(), auth=self.auth_tuple)
    if r.status_code == requests.codes.ok:
      return r.text

    self.ERROR("GET: {} - Could not retrieve global vars html - {} - {}".format(url, r.status_code, r.text))
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
      self.WARN("GET: {} - Issue retrieving build number for job {} - Status code: {} - {}".format(
        url, jobname, r.status_code, r.text))
      self.WARN("Defaulting build number to 1.")
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

  def abort_active_build(self):
    url = "{}/stop".format(self.active_build_url)
    self.INFO("POST: {}".format(url))

    r = requests.post(
      url, 
      auth=self.auth_tuple,
      headers=self.get_request_headers())

    if r.status_code == requests.codes.ok or r.status_code == 201:
      return r.text + "."
    self.ERROR("POST: {} - Could not abort job {} - Status code {}".format(
      url, jobname, r.status_code))
    return None

  def validate_dec_pipeline_job(self, content):    
    url = "{}/pipeline-model-converter/validate".format(self.jenkins_uri)
    payload = {"jenkinsfile": content}
    self.INFO("POST: {}".format(url))

    r = requests.post(
      url, 
      auth=self.auth_tuple,
      data=payload)

    if r.status_code == requests.codes.ok or r.status_code == 201:
      return r.text
    self.ERROR("POST: {} - Could not validate pipeline - Status code {}".format(
      url, r.status_code))
    return None

  def build_ready(self, build_url):
    timeout = self.timeout_secs
    self.OUT("Waiting for build.")
    while timeout > 0:
      r = requests.get(build_url)
      if r.status_code == requests.codes.ok:
        self.OUT_LINE("")
        return True
      self.OUT('.')
      sleep(1)
      timeout = timeout - 1

    self.OUT_LINE("")
    self.ERROR("Timed out at {} secs waiting for build at {}".format(self.timeout_secs, build_url))
    return False
#</editor-fold>

  ############################################################################
  # Starts the flow for remotely building a Jenkins pipeline job,
  # using the user's view contents as the pipeline script.
  def start_pipeline_build(self, view):
    if self.active_build_url != None:
      self.WARN("Pipeline already building/streaming: {}.".format(self.active_build_url))
      return

    # Create/retrieve/show our output panel and clear the contents.
    self.reload_output_panel();

    # Retrieve jenkins authentication crumb (CSRF token) to make requests remotely.
    # TODO: CSRF crumb support for console output is not supported yet.
    self.get_auth_crumb()
    content = view.substr(sublime.Region(0, view.size()))
    self.build_pipeline(content, self.filename)

  #############################################################################
  # Remotely builds the passed Jenkins Pipeline source.
  # Pipeline source is inserted into a template 'config.xml' and then
  # remotely determines whether job exists and needs to be updated,
  # or job doesn't exist and needs to be created.
  def build_pipeline(self, source, job): 
    content = ""
    xmlpath = os.path.join(sublime.packages_path(), "pypline")
    with open('{}/config.xml'.format(xmlpath), 'r') as myfile:
      content = myfile.read().replace('\n', '')

    # Take into account special characters for XML. XML is shit&;
    config = content.replace("++CONTENT++", "<![CDATA[" + source + "]]>")

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
    self.existing_job = jobname

    # Start build, create build URL, and wait for build to begin.
    if not self.build_job(jobname): return
    self.active_build_url = "{}/job/{}/{}".format(self.jenkins_uri, jobname, next_build_number)
    self.INFO("Build started for '{}' at {}".format(jobname, self.active_build_url))

    # Wait for build to start.
    if not self.build_ready(self.active_build_url): return

    # Stream output to Sublime console or open browser to output.
    if self.open_browser_build_output:
      browser_url = "{}/console".format(self.active_build_url)
      self.OUT_LINE("Opening browser to console output: {}".format(browser_url))
      self.open_browser_at(browser_url)
    else:
      # Print build output to console if specified.
      self.INFO("Streaming build output.")
      self.stream_console_output(self.active_build_url)

    # Indicate job is finished.
    self.active_build_url = None

  #############################################################################
  # Streams the build's output via Jenkins' progressiveText by keeping an 
  # open session with the API, and writing out content as it comes in. The 
  # method will return once the build is complete, which is determined
  # via Jenkins API.
  def stream_console_output(self, build_url):    
    # Switch focus to the console output panel.
    sublime.active_window().focus_view(self.output_panel)    
    barrier_line = '-' * 80   

    # Get job console till job stops
    job_url = "{}/logText/progressiveText".format(build_url)
    self.OUT_LINE(barrier_line)
    self.OUT_LINE("Getting Console output {}".format(job_url))
    self.OUT_LINE(barrier_line)
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
        self.OUT_LINE(content.replace("\\t", "\t").replace("\r\n", "\n"))

        sleep(1)

        start_at = int(console_response.headers.get("X-Text-Size"))

      # No content for a while lets check if job is still running
      if check_job_status > 1:
        job_status_url = "{}/api/json".format(build_url)
        job_requests = requests.get(
          job_status_url,
          headers=self.get_request_headers())

        job_bulding= job_requests.json().get("building")
        if not job_bulding:
          # We are done
          stream_open = False
        else:
          # Job is still running
          check_job_status = 0
  
    self.OUT_LINE("-------------------------------------------------------------------------------")
    self.OUT_LINE("Console stream ended.")
    self.OUT_LINE("-------------------------------------------------------------------------------")

  #############################################################################
  # Validates the active view's pipeline code.
  def validate(self, view):
    if not is_groovy_view(view): return

    content = view.substr(sublime.Region(0, view.size()))
    r = self.validate_dec_pipeline_job(content)
    response_text = r.split("\r\n")
    for line in response_text:
      self.OUT_LINE(line)

  #############################################################################
  # Shows the available Pipeline global vars and shared library calls via
  # Sublime's quick panel.
  def show_globalvars_api_search(self, view):
    self.refresh_pipeline_globalvars_api()    
    api_list = ["{}: {}".format(v.name, "{}...".format(v.description[:40])) for v in self.pipeline_globalvars_api]    
    view.window().show_quick_panel(api_list, 
      lambda idx: self.show_globalvars_api_search_on_chosen(view, idx))

  #############################################################################
  # Handles a search selection for the show_globalvars_api_search method.
  def show_globalvars_api_search_on_chosen(self, view, idx):
    if idx < 0: return
    var = self.pipeline_globalvars_api[idx]    

    # Add var name as title to the content and remove code tags (messes up formatting)
    content = var.descriptionHtml
    content = "<div id='outer'><h2>{}</h2>".format(var.name) + content + "</div>"
    content = content.replace("<code>", "").replace("</code>", "")

    mdpopups.show_popup(view=view, css=STYLES, md=True, content=content, location=-1, max_width=1024, max_height=768)
    # view.run_command("insert_snippet", { "contents": var.name})

  #############################################################################
  #  Shows the available Pipeline steps API via Sublime's quick panel.
  def show_steps_api_search(self, view):
    self.refresh_pipeline_steps_api()
    api_list = ["{}: {}".format(p.name, p.doc) for p in self.pipeline_steps_api]

    view.window().show_quick_panel(api_list, 
      lambda idx: self.show_steps_api_search_on_chosen(view, idx))

  #############################################################################
  # Handles a search selection from show_steps_api_search
  def show_steps_api_search_on_chosen(self, view, idx):
    if idx <= 0: return
    step = self.pipeline_steps_api[idx]
    view.run_command("insert_snippet", { "contents": step.get_snippet() })

  def refresh_pipeline_globalvars_api(self):
    html = self.get_pipeline_globalsvars_html()
    if html is None: return

    self.pipeline_globalvars_api = []

    soup = BeautifulSoup(html, "html.parser")
    parent = soup.find("dl", class_="steps variables root")
    child = parent.find("dt")

    while child is not None:
      childName = child.get('id')
      childDescr = child.find_next("dd").find_next("div")

      var =  PipelineVarDoc()
      var.name = childName
      var.descriptionHtml = str(childDescr)
      var.description = childDescr.text.strip()

      if not any(v.name == var.name for v in self.pipeline_globalvars_api):
        self.pipeline_globalvars_api.append(var)

      child = child.find_next("dt")


  #############################################################################
  # Generates the list of Pipeline steps by parsing the output from the
  # 'pipeline-syntax/gdsl' endpoint. Would be nice if there was a library for
  # parsing this, but some poorly written regex will do just nicely...
  def refresh_pipeline_steps_api(self):
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

        if step != None:
          if any(p.name == step.name and len(p.param_map) < len(step.param_map) for p in self.pipeline_steps_api):
            self.pipeline_steps_api = [x for x in self.pipeline_steps_api if not x.name == step.name]          
          self.pipeline_steps_api.append(step)
    
    # Sort by step name.
    self.pipeline_steps_api.sort(key=lambda x: x.name)

  #############################################################################
  # Parses a GDSL method line, returning a PipelineStepDoc object.
  def parse_method_line(self, line):
    name = ""
    doc = ""
    params = {}
    match_type = 0

    # First method signature.
    m = re.match("method\(name:\s+'(.*?)',.* params: \[(.*?)],.* doc:\s+'(.*)'", line)
    if m:
      name = m.group(1) 
      doc = m.group(3)
      match_type = 1

      # Parse step parameters.
      params = {} 
      for p in m.group(2).split(", "):
        self.DEBUG("\t param: {}".format(p))
        pcomps = p.split(":")
        if (pcomps[0] == ""): continue
        params[pcomps[0]] = pcomps[1].replace("'", "").strip()

    else:
      m = re.match("method\(name:\s+'(.*?)',.*namedParams: \[(.*?)\],.* doc:\s+'(.*)'", line)
      if not m: return None

      name = m.group(1)
      doc = m.group(3)
      match_type = 2

      rawParams = m.group(2).split(", parameter")
      for rp in rawParams:
        self.DEBUG("\t param: {}".format(rp))
        tm = re.match(".*name:\s+'(.*?)', type:\s+'(.*?)'.*", rp)
        if not tm: continue
        params[tm.group(1)] = tm.group(2)

    self.DEBUG("Parsed name: {} - doc: {} - match_type: {}".format(name, doc, match_type))
    s = PipelineStepDoc()
    s.name = name
    s.doc = doc
    s.param_map = params
    return s

  def job_name_from_view(self, view):
    #   # Grab file name (to be used for jenkins job update/create)
    jobname = ntpath.basename(view.file_name())
    if "." in jobname:
      jobname = os.path.splitext(jobname)[0]

# ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ #
# # ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ • ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ # #
# # # ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ • • • ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ # # #
# # ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ • ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ # #
# ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ #

# Time to get lazy. Time to get crazy. 
# Just give in. It's singleton time, baby.
pypline = Pypline()

###############################################################################
# Class for the command entry point.
###############################################################################
class PyplineCommand(sublime_plugin.TextCommand):
  
  def run(self, edit, target_idx = -1):
    pypline.reload(self.view)

    # grab the default commands from the Default.sublime-commands resource
    data = json.loads(sublime.load_resource("Packages/Pypline/Default.sublime-commands"))
    command_names = [x['caption'] for x in data]

    if target_idx != -1:
      self.target_option_select(target_idx, edit)
    else:
      self.view.window().show_quick_panel(
        command_names, 
        lambda idx: self.target_option_select(idx, edit))
  
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
    
###############################################################################
# Event class for handling Jenkins Pipeline auto-completions.
###############################################################################
class PyplineCompletions(sublime_plugin.EventListener):

  def on_query_completions(self, view, prefix, locations):
    if not is_groovy_view(view, locations) or not pypline.snippets_enabled: 
      return ([], 0)

    pypline.reload(view)
    completions = self.get_completions()
    return (completions, sublime.INHIBIT_EXPLICIT_COMPLETIONS)

  def get_completions(self):    
    if pypline.pipeline_steps_api == None: 
      pypline.refresh_pipeline_steps_api()

    completions = []
    for step in pypline.pipeline_steps_api:
      completions.append(("{}\t{}\tPypline".format(step.name, step.get_signature()), step.get_snippet()))
    return completions

# *****************************************************************************
# Global (static ?) methods.
# *****************************************************************************
def is_groovy_view(view, locations = None):
    return (
      (view.file_name() and is_groovy_file(view.file_name())) or 
      ('Groovy' in view.settings().get('syntax')) or 
      ( locations and len(locations) and '.groovy' in view.scope_name(locations[0])))

def is_groovy_file(file):
  return file and file.endswith('.groovy')