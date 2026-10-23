-- Original, disposable capability probe. Run from Script > Run script from file.
print("[EditorMCP probe] Lua=" .. tostring(_VERSION))
for _, name in ipairs({"strSaveText", "strLoadText_unsigned", "Wait", "Delay", "edtGetMemberValue", "edtHasMemberValue", "edtSetMemberValue"}) do
  print("[EditorMCP probe] " .. name .. "=" .. type(_G[name]))
end
-- Either possible argument order stays inside our own disposable namespace.
local ok, result = pcall(strSaveText, "Content/EditorMcp/probe-a.txt", "Content/EditorMcp/probe-b.txt")
print("[EditorMCP probe] text write=" .. tostring(ok) .. " " .. tostring(result))
print("[EditorMCP probe] before delay")
Wait(Delay(0.1))
print("[EditorMCP probe] after delay")
