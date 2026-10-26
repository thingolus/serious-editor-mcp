-- Serious Editor MCP bridge. Copyright (c) 2026 Thingolus. MIT license.
-- Run explicitly with Script > Run script from file. No startup hook is installed.
-- Only fixed operations are accepted; request data is never executed.
if type(edtGetMemberValue) ~= "function" then
  error("EditorMCP requires the Serious Editor console, not a world script or game.")
end

local base = "Content/EditorMcp/"
local reloadId = globals.EditorMcpBridgeState and globals.EditorMcpBridgeState.reloadId
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
local scenes, sceneOrder = {}, {}
local documents, documentOrder = {}, {}
local simulation = nil
local function simulationActive()
  local doc=guiGetActiveDocument()
  return simulation and simulation.document and type(doc)=="table" and doc._CT_OBJECT_USERDATA_==simulation.document._CT_OBJECT_USERDATA_ or false
end
local function simulationResult()
  if not simulation then return '{"simulationId":null,"status":"none","running":null}' end
  return '{"simulationId":'..quote(simulation.id)..',"status":'..quote(simulation.status)..
    ',"requestedPath":'..quote(simulation.path)..',"activeDocument":'..tostring(simulationActive())..
    ',"withPlayer":'..tostring(simulation.withPlayer)..',"playerSettingRestored":'..scalar(simulation.restored)..',"running":null}'
end
local function restorePlayerSetting()
  -- Preserve a user change made while the simulation was running.
  if prj_bAutoCreatePlayerInEditor==simulation.withPlayer then
    prj_bAutoCreatePlayerInEditor=simulation.previousPlayer
    simulation.restored=prj_bAutoCreatePlayerInEditor==simulation.previousPlayer
  else simulation.restored=false end
end
local function currentDocument()
  local doc = guiGetActiveDocument()
  if type(doc) ~= "table" or not doc._CT_OBJECT_USERDATA_ then error("No active editor document") end
  return doc
end
local function documentResult(id, path, nativeDocument)
  local doc = currentDocument()
  documents[id] = { document = doc, path = path, nativeDocument = nativeDocument }
  documentOrder[#documentOrder+1] = id
  if #documentOrder > 32 then documents[documentOrder[1]] = nil; table.remove(documentOrder, 1) end
  return '{"documentId":'..quote(id)..',"requestedPath":'..scalar(path)..',"documentPath":null,"pathSource":"open request","dirty":null}'
end
local function checkedDocument(id)
  local record=documents[id]
  if not record or not record.nativeDocument then error("Unknown document token; open it through editor_open_document again") end
  if currentDocument()._CT_OBJECT_USERDATA_ ~= record.document._CT_OBJECT_USERDATA_ then error("Active document changed; open the intended document again") end
  return record
end
local function enumerateScene()
  local previous, entities, seen = {}, {}, {}
  for i=0,edtCountSelectedEntityProperties()-1 do previous[#previous+1]=edtGetSelectedEntityProperty(i) end
  local ok, problem = pcall(function()
    edtClearEntityPropertySelection()
    edtSelectAllEntityProperties()
    for i=0,edtCountSelectedEntityProperties()-1 do
      local entity=edtGetSelectedEntityProperty(i)
      local id=entity:GetEntityID()
      if not seen[id] then
        if #entities >= 200 then error("Scene exceeds 200 entities; use a smaller fixture") end
        seen[id]=true; entities[#entities+1]=entity
      end
    end
  end)
  local restored, restoreProblem=pcall(function()
    edtClearEntityPropertySelection()
    for _,entity in ipairs(previous) do edtSelectEntityProperty(entity) end
  end)
  if not restored then error("Selection restoration failed; inspect the editor: "..tostring(restoreProblem)) end
  if not ok then error(problem) end
  return entities
end
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

local function memberResult(path)
  local value = edtGetMemberValue(path)
  local resourcePath=nil
  if type(value)=="userdata" then
    local ok,name=pcall(function() return value:GetFileName() end)
    if ok and type(name)=="string" then resourcePath=name end
  end
  return '{"path":'..quote(path)..',"valueType":'..quote(type(value))..
    ',"value":'..scalar(value)..',"resourcePath":'..scalar(resourcePath)..'}'
end

local function dispatch(operation, encoded, id)
  local argument = unhex(encoded)
  if argument:find("%z") then error("Invalid property path") end
  if operation == "ping" then
    return '{"bridgeVersion":"0.7.0","luaVersion":' .. quote(_VERSION) ..
      ',"readOnly":false,"undoMode":"conditional-property-restore","getMember":' .. tostring(type(edtGetMemberValue) == "function") ..
      ',"hasMember":' .. tostring(type(edtHasMemberValue) == "function") .. '}'
  elseif operation == "document" then
    local record=checkedDocument(argument)
    return '{"documentId":'..quote(argument)..',"active":true,"requestedPath":'..quote(record.path)..',"documentPath":null,"dirty":null}'
  elseif operation == "open_document" then
    if not argument:match('^Content/[A-Za-z0-9_ /%.%-]+$') or argument:find('..',1,true) or argument:find('//',1,true) or
      not (argument:match('%.wld$') or argument:match('%.ep$')) then error("Invalid world/resource content path") end
    local result = edtOpenDocument(argument)
    if type(result) ~= "table" or not result._CT_OBJECT_USERDATA_ then error("Open did not return a document handle") end
    return documentResult(id, argument, result)
  elseif operation == "simulation" then
    return simulationResult()
  elseif operation == "stop_simulation" then
    if not simulation or simulation.id~=argument then error("Unknown simulation token; inspect editor_simulation") end
    if simulation.status=="stopped" then return simulationResult() end
    if not simulationActive() then error("Simulation document is not active; select its editor tab before stopping") end
    simulation.status="stop-requested"
    edtExecuteCommand("Command.CloseDocument")
    if simulationActive() then error("Simulation close did not change the active document; inspect editor") end
    simulation.status="stopped"
    restorePlayerSetting()
    return simulationResult()
  elseif operation == "start_simulation" then
    local documentId,player=argument:match('^([a-f0-9%-]+)\n([01])$')
    if not documentId then error("Expected document token and player option") end
    if simulation and simulation.status~="stopped" and simulation.status~="failed" then error("A tracked simulation already exists; inspect/stop it first") end
    local record = checkedDocument(documentId)
    if not record.path:match("%.wld$") then error("Simulation requires an opened world") end
    if type(prj_bAutoCreatePlayerInEditor)~="boolean" then error("Required player-creation setting unavailable") end
    simulation={id=id,path=record.path,status="start-requested",withPlayer=player=="1",previousPlayer=prj_bAutoCreatePlayerInEditor}
    prj_bAutoCreatePlayerInEditor=simulation.withPlayer
    local ok,problem=pcall(edtExecuteCommand,"Command.StartDefaultSimNonExclusive")
    local active=guiGetActiveDocument()
    if type(active)=="table" and active._CT_OBJECT_USERDATA_ and active._CT_OBJECT_USERDATA_~=record.document._CT_OBJECT_USERDATA_ then
      simulation.document=active
      simulation.status=ok and "document-created" or "uncertain"
    else
      simulation.status="failed";restorePlayerSetting()
      error("Simulation did not create an active document; inspect editor log: "..tostring(problem))
    end
    if not ok then error("Simulation start uncertain; inspect editor_simulation: "..tostring(problem)) end
    return simulationResult()
  elseif operation == "save_document" then
    local record = checkedDocument(argument)
    -- guiGetActiveDocument returns an interface, not the concrete handle required here.
    edtSaveDocument(record.nativeDocument)
    return '{"saveRequested":true,"saved":null}'
  elseif operation == "reload_bridge" then
    if argument ~= "expire-contexts" then error("Reload requires explicit context-expiry acknowledgement") end
    if simulation and simulation.status~="stopped" and simulation.status~="failed" then error("Stop the tracked simulation before reloading the bridge") end
    state.reloadId = id
    state.reload = true
    state.running = false
    return '{}'
  elseif operation == "selection" then
    local target = selection()
    contexts[id] = target
    contextOrder[#contextOrder+1] = id
    if #contextOrder > 32 then contexts[contextOrder[1]] = nil; table.remove(contextOrder, 1) end
    return '{"contextId":' .. quote(id) .. ',"entityId":' .. scalar(target.entityId) ..
      ',"name":' .. quote(target.name) .. ',"documentPath":null,"documentIdentity":"retained editor handle"}'
  elseif operation == "read_selection_members" then
    local contextId, paths=argument:match('^([a-f0-9%-]+)\n(.+)$')
    local target=contextId and contexts[contextId]
    if not target then error("Unknown/expired context; inspect selection again") end
    sameTarget(target)
    local rows,seen={},{}
    if paths:sub(-1)=="\n" or paths:find("\n\n",1,true) then error("Empty member path") end
    for path in paths:gmatch("[^\n]+") do
      if #rows>=16 or #path>192 or not path:match('^[A-Za-z_][A-Za-z0-9_/%[%]%.%-]*$') or seen[path] then
        error("Use 1-16 distinct property paths, each at most 192 ASCII characters")
      end
      seen[path]=true
      if hasMember(path) then
        rows[#rows+1]='{"exists":true,"member":'..memberResult(path)..'}'
      else
        rows[#rows+1]='{"exists":false,"member":{"path":'..quote(path)..'}}'
      end
    end
    sameTarget(target)
    local result='{"contextId":'..quote(contextId)..',"entityId":'..scalar(target.entityId)..',"members":['..table.concat(rows,",")..']}'
    if #result>48000 then error("Member response exceeds size limit") end
    return result
  elseif operation == "scene" then
    local doc=guiGetActiveDocument()
    if type(doc)~="table" or not doc._CT_OBJECT_USERDATA_ then error("Open a world document") end
    local snapshot={document=doc,entities={}}
    local rows={}
    for _,entity in ipairs(enumerateScene()) do
      local entityId=entity:GetEntityID()
      local q=entity:GetPlacement()
      snapshot.entities[entityId]=entity
      rows[#rows+1]='{"entityId":'..scalar(entityId)..',"name":'..quote(entity:GetName())..
        ',"className":'..quote(entity:GetEntityClassName())..',"position":{"x":'..scalar(q.vx)..',"y":'..scalar(q.vy)..',"z":'..scalar(q.vz)..'}}'
    end
    local result='{"sceneId":'..quote(id)..',"entities":['..table.concat(rows,",")..'],"selectionRestored":true}'
    if #result>48000 then error("Scene response exceeds size limit") end
    scenes[id]=snapshot; sceneOrder[#sceneOrder+1]=id
    if #sceneOrder>8 then scenes[sceneOrder[1]]=nil;table.remove(sceneOrder,1) end
    return result
  elseif operation == "select_entity" then
    local sceneId,entityId=argument:match('^([a-f0-9%-]+)\n(%d+)$')
    local snapshot=scenes[sceneId]
    local entity=snapshot and snapshot.entities[tonumber(entityId)]
    if not entity then error("Unknown scene or entity; call editor_scene again") end
    local doc=guiGetActiveDocument()
    if type(doc)~="table" or doc._CT_OBJECT_USERDATA_~=snapshot.document._CT_OBJECT_USERDATA_ then error("Editor document changed") end
    local present=false
    for _,current in ipairs(enumerateScene()) do
      if current:GetEntityID()==tonumber(entityId) and current._CT_OBJECT_USERDATA_==entity._CT_OBJECT_USERDATA_ then present=true end
    end
    if not present then error("Entity was removed or replaced; call editor_scene again") end
    edtClearEntityPropertySelection();edtSelectEntityProperty(entity)
    return '{"selected":true,"entityId":'..entityId..'}'
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
    return memberResult(argument)
  end
  error("Unsupported operation")
end

-- Ignore the pre-existing request on startup. A restart must never replay a mutation.
local _, initial = pcall(strLoadText_unsigned, base .. "request.txt")
local lastId = type(initial) == "string" and initial:gsub("\r\n", "\n"):match("^SE_MCP/1\n([a-f0-9%-]+)\n") or nil
print("[EditorMCP] bridge 0.7.0 started; conditional edit/undo; stop with globals.EditorMcpBridgeState.running=false")
-- Acknowledge only from the new listener: no request can fall into the reload gap.
local pendingResponse, responseAttempts = nil, 0
if reloadId then pendingResponse="SE_MCP/1\n"..reloadId.."\nok\n{\"reloaded\":true,\"tokensExpired\":true,\"bridgeVersion\":\"0.7.0\"}\n" end
local function flushResponse()
  if not pendingResponse then return end
  responseAttempts=responseAttempts+1
  -- strSaveText may log a Windows sharing violation without throwing. Verify
  -- exact read-back and retry the cached response, never the executed operation.
  pcall(strSaveText,base.."response.txt",pendingResponse)
  local ok,observed=pcall(strLoadText_unsigned,base.."response.txt")
  if ok and type(observed)=="string" and observed:gsub("\r\n","\n"):gsub("^\239\187\191","")==pendingResponse then
    pendingResponse=nil;responseAttempts=0
  elseif responseAttempts>=50 then
    state.running=false
    print("[EditorMCP] response delivery failed after 50 attempts; operation may have executed. Inspect state before restarting.")
  end
end
while state.running do
  flushResponse()
  if not pendingResponse and state.running then
    local loaded, request = pcall(strLoadText_unsigned, base .. "request.txt")
    if loaded and type(request) == "string" and #request <= 16384 then
      request = request:gsub("\r\n", "\n")
      local id, operation, encoded = request:match("^SE_MCP/1\n([a-f0-9%-]+)\n([a-z_]+)\n([0-9a-f]*)\n$")
      if id and #id == 36 and id ~= lastId then
        lastId = id
        local ok, result = pcall(dispatch, operation, encoded, id)
        if not ok then result = '{"error":' .. quote(result) .. '}' end
        local response = "SE_MCP/1\n" .. id .. "\n" .. (ok and "ok" or "error") .. "\n" .. result .. "\n"
        if not state.reload then pendingResponse=response;flushResponse() end
      end
    end
  end
  Wait(Delay(0.1))
end
print("[EditorMCP] bridge stopped")
if state.reload then return dofile(base .. "bridge.lua") end
