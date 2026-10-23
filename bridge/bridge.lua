-- Serious Editor MCP bridge. Copyright (c) 2026 Thingolus. MIT license.
-- Run explicitly with Script > Run script from file. No startup hook is installed.
-- Only fixed read-only operations are accepted; request data is never executed.
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
  if #value > 2048 or #value % 2 ~= 0 or value:find("[^0-9a-f]") then error("Invalid argument encoding") end
  return (value:gsub("..", function(pair) return string.char(tonumber(pair, 16)) end))
end

local function hasMember(path)
  local result = edtHasMemberValue(path)
  -- This editor exposes its boolean result as a numeric 0/1.
  return result ~= nil and result ~= false and result ~= 0
end

local function dispatch(operation, encoded)
  local argument = unhex(encoded)
  if argument:find("%z") then error("Invalid property path") end
  if operation == "ping" then
    return '{"bridgeVersion":"0.1.0","luaVersion":' .. quote(_VERSION) ..
      ',"readOnly":true,"getMember":' .. tostring(type(edtGetMemberValue) == "function") ..
      ',"hasMember":' .. tostring(type(edtHasMemberValue) == "function") .. '}'
  elseif operation == "has_member" then
    return '{"path":' .. quote(argument) .. ',"exists":' .. scalar(hasMember(argument)) .. '}'
  elseif operation == "get_member" then
    if not hasMember(argument) then error("Member does not exist in the current editor context") end
    local value = edtGetMemberValue(argument)
    return '{"path":' .. quote(argument) .. ',"valueType":' .. quote(type(value)) .. ',"value":' .. scalar(value) .. '}'
  end
  error("Unsupported operation")
end

local lastId = nil
print("[EditorMCP] bridge 0.1.0 started; read-only; stop with globals.EditorMcpBridgeState.running=false")
while state.running do
  local loaded, request = pcall(strLoadText_unsigned, base .. "request.txt")
  if loaded and type(request) == "string" and #request <= 8192 then
    request = request:gsub("\r\n", "\n")
    local id, operation, encoded = request:match("^SE_MCP/1\n([a-f0-9%-]+)\n([a-z_]+)\n([0-9a-f]*)\n$")
    if id and #id == 36 and id ~= lastId then
      lastId = id
      local ok, result = pcall(dispatch, operation, encoded)
      if not ok then result = '{"error":' .. quote(result) .. '}' end
      local response = "SE_MCP/1\n" .. id .. "\n" .. (ok and "ok" or "error") .. "\n" .. result .. "\n"
      local saved, problem = pcall(strSaveText, base .. "response.txt", response)
      if not saved then print("[EditorMCP] response failed: " .. tostring(problem)) end
    end
  end
  Wait(Delay(0.1))
end
print("[EditorMCP] bridge stopped")
