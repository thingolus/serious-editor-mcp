-- Serious Editor MCP bridge. Copyright (c) 2026 Thingolus. MIT license.
-- Run explicitly with Script > Run script from file. No startup hook is installed.
-- Only fixed operations are accepted; request data is never executed.
if type(edtGetMemberValue) ~= "function" then
  error("EditorMCP requires the Serious Editor console, not a world script or game.")
end

local base = "Content/EditorMcp/"
local state = { running = true }
-- A reload retires the old coroutine without stacking multiple listeners.
if globals.EditorMcpBridgeState then globals.EditorMcpBridgeState.running = false end
globals.EditorMcpBridgeState = state

local function quote(value)
  local text = tostring(value)
  if #text > 24000 then error("Result exceeds bridge size limit") end
  return '"' .. text:gsub('[%z\1-\31\\"]', function(character)
    return string.format("\\u%04x", string.byte(character))
  end) .. '"'
end

local function scalar(value)
  local kind = type(value)
  if kind == "nil" then return "null" end
  if kind == "boolean" then return tostring(value) end
  if kind == "number" and value == value and value ~= 1/0 and value ~= -1/0 then return tostring(value) end
  -- Engine objects/tables are descriptions, not an invented serialization format.
  return quote(value)
end

local function unhex(value)
  if #value > 8192 or #value % 2 ~= 0 or value:find("[^0-9a-f]") then error("Invalid argument encoding") end
  return (value:gsub("..", function(pair) return string.char(tonumber(pair, 16)) end))
end

local function hasMember(path)
  local result = edtHasMemberValue(path)
  -- This editor exposes its boolean result as a numeric 0/1.
  return result ~= nil and result ~= false and result ~= 0
end

-- Retained handles bind edits to an actual document and entity, not a name/ID alone.
-- No native Undo command is used: it can undo an unrelated editor operation.
local contexts, edits = {}, {}
local contextOrder, editCount = {}, 0
local function selection()
  if edtCountSelectedEntityProperties() ~= 1 then error("Select exactly one entity") end
  local doc = guiGetActiveDocument()
  local entity = edtGetSelectedEntityProperty(0)
  if type(doc) ~= "table" or type(entity) ~= "table" or
    not doc._CT_OBJECT_USERDATA_ or not entity._CT_OBJECT_USERDATA_ then error("Editor context unavailable") end
  return { document = doc, entity = entity, entityId = entity:GetEntityID(), name = entity:GetName() }
end
local function sameTarget(target)
  local current = selection()
  if current.document._CT_OBJECT_USERDATA_ ~= target.document._CT_OBJECT_USERDATA_ or
    current.entity._CT_OBJECT_USERDATA_ ~= target.entity._CT_OBJECT_USERDATA_ or
    current.entityId ~= target.entityId then error("Editor document or selected entity changed; select the original target") end
  return current
end
local function property(path)
  if path ~= "ep_strName" and path ~= "ep_bSphere" and path ~= "ep_satAutoRun" then error("Property is not in the verified edit allowlist") end
  if not hasMember(path) then error("Selected entity does not have this property") end
  local value = edtGetMemberValue(path)
  if path == "ep_satAutoRun" then
    if value ~= "SAT_ALWAYS" and value ~= "SAT_ONLYONHOST" then error("Unsupported script auto-run value") end
    return value
  end
  if path == "ep_strName" then
    if type(value) ~= "string" then error("Unexpected engine property type") end
    return value
  end
  if value ~= 0 and value ~= 1 then error("Unexpected engine boolean representation") end
  return value == 1
end
local function inputValue(path, kind, text)
  local value = unhex(text)
  if path == "ep_satAutoRun" and kind == "s" and (value == "SAT_ALWAYS" or value == "SAT_ONLYONHOST") then return value end
  if path == "ep_strName" and kind == "s" then
    if #value < 1 or #value > 128 or value:find('[%z\1-\31]') then error("Name must be 1-128 bytes without control characters") end
    return value
  end
  if path == "ep_bSphere" and kind == "b" and (value == "true" or value == "false") then return value == "true" end
  error("Property value has the wrong type")
end
local function writeChecked(record, expected, desired)
  sameTarget(record.target)
  if property(record.path) ~= expected then error("Property changed since preview/edit; refusing to overwrite it") end
  local engineValue = desired
  if record.path == "ep_bSphere" then engineValue = desired and 1 or 0 end
  -- Once attempted, failure is uncertain: never retry the setter automatically.
  local ok, problem = pcall(edtSetMemberValue, record.path, engineValue)
  local readOk, observed = pcall(property, record.path)
  if not ok or not readOk or observed ~= desired then
    record.status = "uncertain"
    error("Edit outcome uncertain; inspect the property before recovery. " .. tostring(problem or observed))
  end
end
local function editResult(id, record)
  return '{"editId":' .. quote(id) .. ',"status":' .. quote(record.status) ..
    ',"entityId":' .. scalar(record.target.entityId) .. ',"path":' .. quote(record.path) ..
    ',"before":' .. scalar(record.before) .. ',"after":' .. scalar(record.after) ..
    ',"undoMode":"conditional-property-restore","saved":false}'
end

local function dispatch(operation, encoded, id)
  local argument = unhex(encoded)
  if argument:find("%z") then error("Invalid property path") end
  if operation == "ping" then
    return '{"bridgeVersion":"0.3.0","luaVersion":' .. quote(_VERSION) ..
      ',"readOnly":false,"undoMode":"conditional-property-restore","getMember":' .. tostring(type(edtGetMemberValue) == "function") ..
      ',"hasMember":' .. tostring(type(edtHasMemberValue) == "function") .. '}'
  elseif operation == "selection" then
    local target = selection()
    contexts[id] = target
    contextOrder[#contextOrder+1] = id
    if #contextOrder > 32 then contexts[contextOrder[1]] = nil; table.remove(contextOrder, 1) end
    return '{"contextId":' .. quote(id) .. ',"entityId":' .. scalar(target.entityId) ..
      ',"name":' .. quote(target.name) .. ',"documentPath":null,"documentIdentity":"retained editor handle"}'
  elseif operation == "preview_edit" then
    local contextId, path, oldKind, oldHex, newKind, newHex = argument:match('^([a-f0-9%-]+)\n([a-zA-Z_]+)\n([sb])\n([a-f0-9]*)\n([sb])\n([a-f0-9]*)$')
    if not contextId or not contexts[contextId] then error("Unknown/expired context; inspect selection again") end
    if editCount >= 128 then error("Session edit limit reached; finish undo work before reloading the bridge") end
    local target = contexts[contextId]
    sameTarget(target)
    local before, after = inputValue(path, oldKind, oldHex), inputValue(path, newKind, newHex)
    if property(path) ~= before then error("Expected old value does not match the editor") end
    if before == after then error("Edit would not change the property") end
    local record = { target = target, path = path, before = before, after = after, status = "preview" }
    edits[id] = record; editCount = editCount + 1
    return editResult(id, record)
  elseif operation == "apply_edit" or operation == "undo_edit" or operation == "edit_status" then
    local record = edits[argument]
    if not record then error("Unknown edit token; records expire on bridge restart") end
    if operation == "apply_edit" then
      if record.status == "preview" then writeChecked(record, record.before, record.after); record.status = "applied"
      elseif record.status ~= "applied" then error("Edit cannot be applied in state " .. record.status) end
    elseif operation == "undo_edit" then
      if record.status == "applied" then writeChecked(record, record.after, record.before); record.status = "undone"
      elseif record.status ~= "undone" then error("Edit cannot be undone in state " .. record.status) end
    end
    return editResult(argument, record)
  elseif operation == "has_member" then
    return '{"path":' .. quote(argument) .. ',"exists":' .. scalar(hasMember(argument)) .. '}'
  elseif operation == "get_member" then
    if not hasMember(argument) then error("Member does not exist in the current editor context") end
    local value = edtGetMemberValue(argument)
    return '{"path":' .. quote(argument) .. ',"valueType":' .. quote(type(value)) .. ',"value":' .. scalar(value) .. '}'
  end
  error("Unsupported operation")
end

-- Ignore the pre-existing request on startup. A restart must never replay a mutation.
local _, initial = pcall(strLoadText_unsigned, base .. "request.txt")
local lastId = type(initial) == "string" and initial:gsub("\r\n", "\n"):match("^SE_MCP/1\n([a-f0-9%-]+)\n") or nil
print("[EditorMCP] bridge 0.3.0 started; conditional edit/undo; stop with globals.EditorMcpBridgeState.running=false")
while state.running do
  local loaded, request = pcall(strLoadText_unsigned, base .. "request.txt")
  if loaded and type(request) == "string" and #request <= 16384 then
    request = request:gsub("\r\n", "\n")
    local id, operation, encoded = request:match("^SE_MCP/1\n([a-f0-9%-]+)\n([a-z_]+)\n([0-9a-f]*)\n$")
    if id and #id == 36 and id ~= lastId then
      lastId = id
      local ok, result = pcall(dispatch, operation, encoded, id)
      if not ok then result = '{"error":' .. quote(result) .. '}' end
      local response = "SE_MCP/1\n" .. id .. "\n" .. (ok and "ok" or "error") .. "\n" .. result .. "\n"
      local saved, problem = pcall(strSaveText, base .. "response.txt", response)
      if not saved then print("[EditorMCP] response failed: " .. tostring(problem)) end
    end
  end
  Wait(Delay(0.1))
end
print("[EditorMCP] bridge stopped")
