import sublime
import sublime_plugin

import os
import sys
import requests
import inspect
import subprocess
import ntpath
import re
import json
import datetime
import time

# Local source imports.
from .models import PipelineStepDoc
from .models import PipelineVarDoc

# Dependency imports.
import mdpopups
from bs4 import BeautifulSoup

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

#------------------------------------------------------------------------------
class Pypline:
  """
  Core class (whatever that means in this instance).
  """

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

  #------------------------------------------------------------------------------
  def load_settings(self, settings):
    """
    Loads settings.
    """
    self.settings =                       settings
    self.jenkins_uri =                    self.settings.get("jenkins_uri", "http://127.0.0.1:8080")
    self.username =                       self.settings.get("username", None)
    self.api_token =                      self.settings.get("password", None)
    self.job_prefix =                     self.settings.get("job_prefix", "")
    self.timeout_secs =                   self.settings.get("open_browser_timeout_secs", 10)
    self.open_browser_build_output =      self.settings.get("open_browser_build_output", False)
    self.open_browser_steps_api =         self.settings.get("open_browser_steps_api", False)
    self.snippets_enabled =               self.settings.get("snippets_enabled", True)

  #------------------------------------------------------------------------------
  def reload(self, view):
    """
    Reloads the Pypline object for use.
    """
    if view is None or view.file_name() is None: return

    # Grab the view/file-name (to be used for jenkins job update/create)
    self.filename = ntpath.basename(view.file_name())
    if "." in self.filename:
      self.filename = os.path.splitext(self.filename)[0]

    settings = sublime.load_settings("pypline.sublime-settings")
    self.load_settings(settings)
    self.auth_tuple = (self.username, self.api_token)

  #------------------------------------------------------------------------------
  def reload_output_panel(self):
    """
    Prepares and opens the output panel celated to the active window.
    """
    self.output_panel = sublime.active_window().create_output_panel(self.filename)
    self.output_panel.run_command("select_all")
    self.output_panel.run_command("right_delete")
    self.output_panel.set_read_only(False)
    self.output_panel.set_syntax_file("Packages/Pypline/pypline-log-syntax.sublime-syntax")
    self.open_output_panel()

  #------------------------------------------------------------------------------
  def open_output_panel(self):
    sublime.active_window().run_command("show_panel", {"panel": "output.{}".format(self.filename)})
    sublime.active_window().focus_view(self.output_panel)

#<editor-fold desc="Loggin Methods">
  #------------------------------------------------------------------------------
  def out(self, message):
    if None == self.output_panel:
      self.reload_output_panel()
    self.output_panel.run_command("append", {"characters": message, "scroll_to_end": True})
    self.output_panel.run_command("move_to", {"to": "eof"})

  #------------------------------------------------------------------------------
  def out_line(self, message):
    self.out("{}\n".format(message))

  #------------------------------------------------------------------------------
  def myprint(self, label, message):
    curframe = inspect.currentframe()
    calframe = inspect.getouterframes(curframe, 2)
    calling_method = calframe[2][3]

    message = "[{}] {} - {} >> {}".format(
      label,
      datetime.datetime.now().strftime("%H:%M:%S"),
      calling_method,
      message)
    print(message)
    if label == "E": self.out_line(message)

  #------------------------------------------------------------------------------
  def debug(self, message):
    if self.DEBUG_ENABLED:
      self.myprint("D", message)

  #------------------------------------------------------------------------------
  def info(self, message):
    self.myprint("I", message)

  #------------------------------------------------------------------------------
  def warn(self, message):
    self.myprint("W", message)

  #------------------------------------------------------------------------------
  def error(self, message):
    self.myprint("E", message)
#</editor-fold>

#<editor-fold desc="HTTP Request Methods for Jenkins">
  #------------------------------------------------------------------------------
  def get_request_headers(self):
    if not self.auth_crumb:
      return {'Content-Type':'text/xml'}
    return {'Content-Type':'text/xml', self.auth_crumb[0]:self.auth_crumb[1]}

  #------------------------------------------------------------------------------
  def get_auth_crumb(self):
    # Extract post-fix http/https
    uri_postfix = 'http'
    m = re.match('(^https?):\/\/', self.jenkins_uri)
    if m:
      uri_postfix = m.group(1)
    url = "{}://{}:{}@{}/crumbIssuer/api/json".format(
      uri_postfix,
      self.username,
      self.api_token,
      self.jenkins_uri.replace("http://", "").replace('https://', ''))
    self.info("GET: {}".format(url))
    try:
      r = requests.get(url)
    except:
      self.warn('Error sending crumb api request.')
      return None
    if r.status_code != requests.codes.ok:
      self.warn("GET: {} - Could not retrieve 'crumb' for authentication - Status code {}".format(
      url,  r.status_code))
      return None

    data = json.loads(r.text)
    self.auth_crumb = (data["crumbRequestField"], data["crumb"])
    self.info("Crumb retrieved - {}:{}".format(self.auth_crumb[0], self.auth_crumb[1]))

  #------------------------------------------------------------------------------
  def open_browser_at(self, url):
    if sys.platform=='win32':
      os.startfile(url)
    elif sys.platform=='darwin':
      subprocess.Popen(['open', url])
    else:
      try:
        subprocess.Popen(['xdg-open', url])
      except:
        self.info('Please open a browser on: ' + url)

  #------------------------------------------------------------------------------
  def job_exists(self, jobname):
    url = "{}/job/{}/api/json".format(self.jenkins_uri, jobname)
    self.info("GET: {}".format(url))
    r = requests.get(url, auth=self.auth_tuple)
    if r.status_code == requests.codes.ok:
      return True
    return False

  #------------------------------------------------------------------------------
  def get_job_config(self, jobname):
    url = "{}/job/{}/config.xml".format(self.jenkins_uri, jobname)
    self.info("GET: {}".format(url))
    r = requests.get(url, auth=self.auth_tuple)
    if r.status_code == requests.codes.ok:
      return r.text
    self.error("GET: {} - Status Code: {}".format(url, r.status_code))
    return None

  #------------------------------------------------------------------------------
  def from_url_format(self, url):
    # Replace base Jenkins URI with the one defined in the config.
    # We do this since Jenkins will provide the URI with a base which may be
    # different from the one specified in the configuration.
    url = url.strip('/')
    m = re.match('.*?/(job/.*)', url)
    if m:
      url = '{}/{}'.format(self.jenkins_uri, m.group(1))

    return url

  #------------------------------------------------------------------------------
  def get_jobs_from_url(self, root_url):
    root_url = self.from_url_format(root_url)

    # Grab 3 levels worth of jobs, accounting for multi-branch and org-folder jobs
    # and their children
    url = '{}/api/json?tree=jobs[fullName,url,jobs[fullName,url,jobs[fullName,url]]]'.format(root_url.strip('/'))
    self.info('GET: {}'.format(url))
    r = requests.get(url, auth=(self.auth_tuple))
    if r.status_code != requests.codes.ok:
      self.error("ERROR - GET: {} - Status Code: {}".format(url, r.status_code))
      sys.exit(1)
    data = r.json()
    return data['jobs']

  #------------------------------------------------------------------------------
  def get_jobs(self, job=None):

    if job is None:
      jobs = self.get_jobs_from_url(self.jenkins_uri)
    else:
      jobs = self.get_jobs_from_url(job['url'])

    # Not all jobs are top level. Need to grab child jobs from certain class
    # types.
    job_list = []
    for job in jobs:
      if job['_class'] == 'com.cloudbees.hudson.plugins.folder.Folder':
        job_list = job_list + self.get_jobs(job)

      # If this is a multibranch parent, grab all it's immediate children.
      if job['_class'] == 'org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject':
        for c in job['jobs']:
          job_list.append(c)
      # If this is a org folder parent, grab all second level children.
      elif job['_class'] == 'jenkins.branch.OrganizationFolder':
        for pc in job['jobs']:
          for c in pc['jobs']:
            job_list.append(c)
      else:
        job_list.append(job)

    return job_list

  #------------------------------------------------------------------------------
  def get_build_numbers_from_url(self, root_url):
    root_url = self.from_url_format(root_url)
    url = '{}/api/json?tree=builds[number]'.format(root_url.strip('/'))
    self.info('GET: {}'.format(url))
    r = requests.get(url, auth=self.auth_tuple)
    if r.status_code != requests.codes.ok:
      self.error("GET: {} - Status Code: {}".format(url, r.status_code))
      return None
    data = r.json()
    return [str(d['number']) for d in data['builds']]

  #------------------------------------------------------------------------------
  def update_job(self, jobname, content):
    url = "{}/job/{}/config.xml".format(self.jenkins_uri, jobname)
    self.info("POST: {}".format(url))
    r = requests.post(
      url,
      data = content,
      headers=self.get_request_headers(),
      auth=self.auth_tuple)

    if r.status_code == requests.codes.ok:
      return r.text + "."
    self.error("POST: {} - Could not update job {} - Status code {}".format(
      url, jobname, r.status_code))
    return None

  #------------------------------------------------------------------------------
  def get_pipeline_globalsvars_html(self):
    if self.existing_job is not None:
      url = "{}/job/{}/pipeline-syntax/globals".format(self.jenkins_uri, self.existing_job)
    else:
      url = "{}/pipeline-syntax/globals".format(self.jenkins_uri)
    self.info("GET: {}".format(url))
    r = requests.get(url, headers=self.get_request_headers(), auth=self.auth_tuple)
    if r.status_code == requests.codes.ok:
      return r.text

    self.error("GET: {} - Could not retrieve global vars html - {} - {}".format(url, r.status_code, r.text))
    return None

  #------------------------------------------------------------------------------
  def create_job(self, jobname, content):
    url = "{}/createItem?name={}".format(self.jenkins_uri, jobname)
    self.info("POST: {}".format(url))
    r = requests.post(
      url,
      data = content,
      headers=self.get_request_headers(),
      auth=self.auth_tuple)

    if r.status_code == requests.codes.ok:
      return r.text + "."
    self.error("POST: {} - Could not create job {} - Status code {} - {}".format(
      url, jobname, r.status_code, r.text))
    return None

  #------------------------------------------------------------------------------
  def next_buildnum(self, jobname):
    url = "{}/job/{}/lastBuild/buildNumber".format(self.jenkins_uri, jobname)
    self.info("GET: {}".format(url))
    r = requests.get(
      url,
      headers=self.get_request_headers())

    if r.status_code != requests.codes.ok:
      self.warn("GET: {} - Issue retrieving build number for job {} - Status code: {} - {}".format(
        url, jobname, r.status_code, r.text))
      self.warn("Defaulting build number to 1.")
      return 1
    return int(r.text) + 1

  #------------------------------------------------------------------------------
  def build_job(self, jobname):
    url = "{}/job/{}/build".format(self.jenkins_uri, jobname)

    self.info("POST: {}".format(url))
    r = requests.post(
      url,
      auth=self.auth_tuple,
      headers=self.get_request_headers())

    if r.status_code == requests.codes.ok or r.status_code == 201:
      return r.text + "."
    self.error("POST: {} - Could not build job {} - Status code {}".format(
      url, jobname, r.status_code))
    return None

  #------------------------------------------------------------------------------
  def abort_active_build(self):
    url = "{}/stop".format(self.active_build_url)
    self.info("POST: {}".format(url))

    r = requests.post(
      url,
      auth=self.auth_tuple,
      headers=self.get_request_headers())

    if r.status_code == requests.codes.ok or r.status_code == 201:
      return r.text + "."
    self.error("POST: {} - Could not abort job {} - Status code {}".format(
      url, jobname, r.status_code))
    return None

  #------------------------------------------------------------------------------
  def validate_dec_pipeline_job(self, content):
    url = "{}/pipeline-model-converter/validate".format(self.jenkins_uri)
    payload = {"jenkinsfile": content}
    self.info("POST: {}".format(url))

    r = requests.post(
      url,
      auth=self.auth_tuple,
      data=payload)

    if r.status_code == requests.codes.ok or r.status_code == 201:
      return r.text
    self.error("POST: {} - Could not validate pipeline - Status code {}".format(
      url, r.status_code))
    return None

  #------------------------------------------------------------------------------
  def build_ready(self, build_url):
    timeout = self.timeout_secs
    self.out("Waiting for build.")
    while timeout > 0:
      r = requests.get(build_url)
      if r.status_code == requests.codes.ok:
        self.out_line("")
        return True
      self.out('.')
      time.sleep(1)
      timeout = timeout - 1

    self.out_line("")
    self.error("Timed out at {} secs waiting for build at {}".format(self.timeout_secs, build_url))
    return False

  #------------------------------------------------------------------------------
  def get_build_log(self, job_name, build_number):
    url = "{}/job/{}/{}/consoleText".format(self.jenkins_uri, job_name, build_number)
    self.info("GET: {}".format(url))
    r = requests.get(
      url,
      auth=self.auth_tuple,
      headers=self.get_request_headers())

    if r.status_code == requests.codes.ok or r.status_code == 201:
      return r.text
    self.error("GET: {} - Could retrieve log for job {} ${} - Status code {}".format(
      url, job_name, build_number, r.status_code))
    return None

  #------------------------------------------------------------------------------
  def get_nodes(self):
    url = "{}/computer/api/json".format(self.jenkins_uri)
    self.info("GET: {}".format(url))
    r = requests.get(
      url,
      auth=self.auth_tuple,
      headers=self.get_request_headers())

    if r.status_code == requests.codes.ok or r.status_code == 201:
      return r.json()['computer']
    self.error("GET: {} - Could retrieve nodes - Status code {}".format(r.status_code))
    return None

#</editor-fold>

  #------------------------------------------------------------------------------
  def ask_node_name(self, view):
    """
    Retrieves list of nodes from Jenkins and displays a selection list.
    """
    nodes = self.get_nodes()
    node_names = ['[{}] {}'.format('Offline' if n['offline'] else 'Online', n['displayName']) for n in nodes]
    view.window().show_quick_panel(
        node_names,
        lambda idx: self.open_node(nodes, idx)
      )

  #------------------------------------------------------------------------------
  def ask_job_name(self, view, open_job=False):
    jobs = self.get_jobs()
    job_names = [j['fullName'] for j in jobs]
    if open_job:
      view.window().show_quick_panel(
        job_names,
        lambda idx: self.open_job(view, jobs, idx)
      )
    else:
      view.window().show_quick_panel(
        job_names,
        lambda idx: self.ask_build_number(view, jobs, idx)
      )

  #------------------------------------------------------------------------------
  def ask_build_number(self, view, jobs, job_idx):
    if job_idx == -1:
      return
    job = jobs[job_idx]
    job_name = job['fullName']
    build_numbers = self.get_build_numbers_from_url(job['url'])
    view.window().show_quick_panel(
      build_numbers,
      lambda idx: self.display_log(view, job, build_numbers, idx)
    )

  #------------------------------------------------------------------------------
  def display_log(self, view, job, build_numbers, build_number_idx):
    if build_number_idx == -1:
      return

    build_number = build_numbers[build_number_idx]
    sublime.status_message('Retrieving build log for {} #{}'.format(job['fullName'], build_number))
    job_url = self.from_url_format(job['url'])
    url = "{}/{}".format(job_url, build_number)

    self.info('URL: {}'.format(url))

    # TODO: Config option to output to either output panel or new tab/view.
    tab = sublime.active_window().new_file()
    tab.set_syntax_file("Packages/Pypline/pypline-log-syntax.sublime-syntax")
    sublime.set_timeout_async(lambda: self.stream_console_output(tab, url), 0)

  #------------------------------------------------------------------------------
  def open_node(self, nodes, idx):
    """
    Opens the selected node in the browser.
    """
    if idx == -1: return
    node = nodes[idx]
    self.open_browser_at('{}/computer/{}'.format(self.jenkins_uri, node['displayName']))

  #------------------------------------------------------------------------------
  def open_job(self, view, jobs, idx):
    if idx == -1:
      return
    job = jobs[idx]
    self.open_browser_at(job['url'])

  #------------------------------------------------------------------------------
  def display_node_storage(self, view):
    nodes = self.get_nodes()
    print(nodes)

  #------------------------------------------------------------------------------
  def script_console_run(self, view):
    """
    Executes text in the current view as a Jenkins script console script.
    Content should be scripts one would execute in the Jenkins Script Console
    page.
    """
    # Create/retrieve/show our output panel and clear the contents.
    self.reload_output_panel();

    # Retrieve jenkins authentication crumb (CSRF token) to make requests remotely.
    # TODO: CSRF crumb support for console output is not supported yet.
    self.get_auth_crumb()
    content = view.substr(sublime.Region(0, view.size()))

    url = "{}/scriptText".format(self.jenkins_uri)
    payload = {'script':content}
    self.info("POST: {}".format(url))
    r = requests.post(
      url,
      auth=self.auth_tuple,
      data=payload)

    if r.status_code == requests.codes.ok or r.status_code == 201 or r.status_code == 200:
      print(r)
      self.out_line(r.text.replace("\r\n", "\n"))
      return

    self.error("POST: {} - Could not run script - Status code {}".format(url, r.status_code))

  #------------------------------------------------------------------------------
  def start_pipeline_build(self, view):
    """
    Starts the flow for remotely building a Jenkins pipeline job
    using the user's view content as the pipeline script.
    """
    if self.active_build_url != None:
      self.warn("Pipeline already building/streaming: {}.".format(self.active_build_url))
      return

    # Create/retrieve/show our output panel and clear the contents.
    self.reload_output_panel();

    # Retrieve jenkins authentication crumb (CSRF token) to make requests remotely.
    # TODO: CSRF crumb support for console output is not supported yet.
    self.get_auth_crumb()
    content = view.substr(sublime.Region(0, view.size()))
    self.build_pipeline(content, self.filename)

  #------------------------------------------------------------------------------
  def start_pipeline_update(self, view):
    """
    Updates your script/job on the Jenkins Master.
    """
    self.reload_output_panel()
    self.get_auth_crumb()
    content = view.substr(sublime.Region(0, view.size()))
    self.create_update_pipeline(content, self.filename)

  #------------------------------------------------------------------------------
  def create_update_pipeline(self, source, job):
    """
    Pipeline source is inserted into a template 'config.xml' and then
    remotely determines whether the job exists and needs to be updated,
    or job doesn't exist and needs to be created.
    """
    content = ""
    xmlpath = os.path.join(sublime.packages_path(), "pypline")
    with open('{}/config.xml'.format(xmlpath), 'r') as myfile:
      content = myfile.read().replace('\n', '')

    # Take into account special characters for XML. XML is shit&;
    config = content.replace("++CONTENT++", "<![CDATA[" + source + "]]>")

    # Format job name based on config.
    jobname = job
    if len(self.job_prefix.strip()) != 0:
      jobname = self.job_prefix + "-" +  job

    # If job exists, update. If not, create.
    if not self.job_exists(jobname):
      self.info("{} doesn't exist. Creating...".format(jobname))
      if not self.create_job(jobname, config): return
    else:
      self.info("{} already exists. Reconfiguring...".format(jobname))
      uj = self.update_job(jobname, config)
      if not uj:
        self.info(uj)
        return
    self.out_line('-' * 80)
    self.out_line('Successfully updated Pipeline: {}'.format(jobname))
    return jobname

  #------------------------------------------------------------------------------
  def build_pipeline(self, source, job):
    """
    Remotely builds the passed Jenkins Pipeline source.
    """
    jobname = self.create_update_pipeline(source, job)
    self.existing_job = jobname
    next_build_number = self.next_buildnum(jobname)

    # Start build, create build URL, and wait for build to begin.
    if not self.build_job(jobname): return
    self.active_build_url = "{}/job/{}/{}".format(self.jenkins_uri, jobname, next_build_number)
    self.info("Build started for '{}' at {}".format(jobname, self.active_build_url))

    # Wait for build to start.
    if not self.build_ready(self.active_build_url): return

    # Stream output to Sublime console or open browser to output.
    if self.open_browser_build_output:
      browser_url = "{}/console".format(self.active_build_url)
      self.out_line("Opening browser to console output: {}".format(browser_url))
      self.open_browser_at(browser_url)
    else:
      # Print build output to console if specified.
      self.info("Streaming build output.")

      # Switch focus to the console output panel.
      sublime.active_window().focus_view(self.output_panel)
      self.stream_console_output(self.output_panel, self.active_build_url)

    # Indicate job is finished.
    self.active_build_url = None

  #------------------------------------------------------------------------------
  def stream_console_output(self, view, build_url):
    """
    Streams the build's output via Jenkins' progressiveText, by keeping an
    open session with the API, while writing out content as it comes in. The
    method will return once the build is complete, which is determined
    via Jenkins API.
    """
    barrier_line = '-' * 80

    # Get job console till job stops
    job_url = "{}/logText/progressiveText".format(build_url)
    view_outline(view, barrier_line)
    view_outline(view, "Getting Console output {}".format(job_url))
    view_outline(view, barrier_line)
    start_at = 0
    stream_open = True
    check_job_status = 0
    console_requests = requests.session()
    end_delay = 0

    while stream_open:
      console_response = console_requests.post(
        job_url,
        data={'start': start_at })

      content_length = int(console_response.headers.get("Content-Length",-1))

      self.debug('Content length: {} bytes'.format(str(content_length)))

      if console_response.status_code != 200:
        view_outline(view, "Error getting console output. Status code: {}".format(console_response.status_code))
        view_outline(view, console_response.content)
        view_outline(view, console_response.headers)
        return

      if content_length == 0:
        time.sleep(1)
        check_job_status +=1
      else:
        check_job_status = 0

        # Print to output panel.
        try:
          view_outline(view, console_response.content.decode('utf-8').replace("\\t", "\t").replace("\r\n", "\n"))
        except:
          view_outline(view, '[Issue decoding string]')

        time.sleep(1)
        start_at = int(console_response.headers.get("X-Text-Size"))

      # No content for a while, so lets check if job is still running.
      if check_job_status > 1:
        job_status_url = "{}/api/json".format(build_url)
        job_requests = requests.get(
          job_status_url,
          headers=self.get_request_headers())

        job_bulding = job_requests.json().get("building")
        if not job_bulding:
          if end_delay > 0:
            # We are done
            stream_open = False
          else: end_delay = end_delay + 1
        else:
          # Job is still running
          check_job_status = 0

    view_outline(view, "-------------------------------------------------------------------------------")
    view_outline(view, "Console stream ended.")
    view_outline(view, "-------------------------------------------------------------------------------")

  #------------------------------------------------------------------------------
  def validate(self, view):
    """
    Validates the active view's pipeline code.
    """
    if not is_groovy_view(view): return

    content = view.substr(sublime.Region(0, view.size()))
    r = self.validate_dec_pipeline_job(content)
    response_text = r.split("\r\n")
    for line in response_text:
      self.out_line(line)

  #------------------------------------------------------------------------------
  def show_globalvars_api_search(self, view):
    """
    Shows the available Pipeline global vars and shared library calls via
    Sublime's quick panel.
    """
    self.refresh_pipeline_globalvars_api()
    api_list = ["{}: {}".format(v.name, "{}...".format(v.description[:40])) for v in self.pipeline_globalvars_api]
    view.window().show_quick_panel(api_list,
      lambda idx: self.show_globalvars_api_search_on_chosen(view, idx))

  #------------------------------------------------------------------------------
  def show_globalvars_api_search_on_chosen(self, view, idx):
    """
    Handles a search selection for the show_globalvars_api_search method.
    """
    if idx < 0: return
    var = self.pipeline_globalvars_api[idx]

    # Add var name as title to the content and remove code tags (messes up formatting)
    content = var.descriptionHtml
    content = "<div id='outer'><h2>{}</h2>".format(var.name) + content + "</div>"
    content = content.replace("<code>", "").replace("</code>", "")

    mdpopups.show_popup(view=view, css=STYLES, md=True, content=content, location=-1, max_width=1024, max_height=768)
    # view.run_command("insert_snippet", { "contents": var.name})

  #------------------------------------------------------------------------------
  def show_steps_api_search(self, view):
    """
    Shows the available Pipeline steps API via Sublime's quick panel.
    """

    self.refresh_pipeline_steps_api()
    api_list = ["{}: {}".format(p.name, p.doc) for p in self.pipeline_steps_api]

    view.window().show_quick_panel(api_list,
      lambda idx: self.show_steps_api_search_on_chosen(view, idx))

  #------------------------------------------------------------------------------
  def show_steps_api_search_on_chosen(self, view, idx):
    """
    Handles a search selection from show_steps_api_search
    """
    if idx <= 0: return
    step = self.pipeline_steps_api[idx]
    view.run_command("insert_snippet", { "contents": step.get_snippet() })

  #------------------------------------------------------------------------------
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

  #------------------------------------------------------------------------------
  def refresh_pipeline_steps_api(self):
    """
    Generates the list of Pipeline steps by parsing the output from the
    'pipeline-syntax/gdsl' endpoint. Would be nice if there was a library for
    parsing this, but some poorly written regex will do just nicely...
    """
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

  #------------------------------------------------------------------------------
  def parse_method_line(self, line):
    """
    Parses a GDSL method line, returning a PipelineStepDoc object.
    """
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
        self.debug("\t param: {}".format(p))
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
        self.debug("\t param: {}".format(rp))
        tm = re.match(".*name:\s+'(.*?)', type:\s+'(.*?)'.*", rp)
        if not tm: continue
        params[tm.group(1)] = tm.group(2)

    self.debug("Parsed name: {} - doc: {} - match_type: {}".format(name, doc, match_type))
    s = PipelineStepDoc()
    s.name = name
    s.doc = doc
    s.param_map = params
    return s

  #------------------------------------------------------------------------------
  def job_name_from_view(self, view):
    #   # Grab file name (to be used for jenkins job update/create)
    jobname = ntpath.basename(view.file_name())
    if "." in jobname:
      jobname = os.path.splitext(jobname)[0]

#------------------------------------------------------------------------------
def view_outline(view, message):
  view_out(view, "{}\n".format(message))

#------------------------------------------------------------------------------
def view_out(view, message):
  view.run_command("append", {"characters": message, "scroll_to_end": True})