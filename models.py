###############################################################################
# Model for storing Pipeline global var and shared library meta-data.
###############################################################################
class PipelineVarDoc:
  name =        ""
  description = ""
  descriptionHtml = ""

  def get_snippet(self):
    return "{} ".format(name)

###############################################################################
# Model for storing Pipeline step meta-data.
###############################################################################
class PipelineStepDoc:
  name =        ""
  doc =         ""
  param_map =   {}
  match_type =  0

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
