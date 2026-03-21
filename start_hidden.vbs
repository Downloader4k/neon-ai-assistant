Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = WScript.Arguments(0)
WshShell.Run "cmd /c npm run dev", 0, False
Set WshShell = Nothing
