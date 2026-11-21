param([Parameter(Mandatory = $true)][string]$PackagePath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Assert-That($Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

$archive = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $PackagePath).Path)
try {
  $entry = $archive.GetEntry('AppxManifest.xml')
  Assert-That ($null -ne $entry) 'AppxManifest.xml is missing'
  $reader = [System.IO.StreamReader]::new($entry.Open())
  try { [xml]$manifest = $reader.ReadToEnd() } finally { $reader.Dispose() }
  $ns = [System.Xml.XmlNamespaceManager]::new($manifest.NameTable)
  $ns.AddNamespace('f', 'http://schemas.microsoft.com/appx/manifest/foundation/windows10')
  $ns.AddNamespace('com', 'http://schemas.microsoft.com/appx/manifest/com/windows10')
  $ns.AddNamespace('desktop4', 'http://schemas.microsoft.com/appx/manifest/desktop/windows10/4')
  $ns.AddNamespace('desktop5', 'http://schemas.microsoft.com/appx/manifest/desktop/windows10/5')
  $ns.AddNamespace('uap', 'http://schemas.microsoft.com/appx/manifest/uap/windows10')
  $ns.AddNamespace('uap5', 'http://schemas.microsoft.com/appx/manifest/uap/windows10/5')
  $root = $manifest.DocumentElement
  foreach ($prefix in @('com', 'desktop4', 'desktop5')) {
    Assert-That ($root.GetNamespaceOfPrefix($prefix) -eq $ns.LookupNamespace($prefix)) "Missing root namespace: $prefix"
    Assert-That ($root.IgnorableNamespaces.Split(' ') -contains $prefix) "Missing IgnorableNamespaces entry: $prefix"
  }
  $extensions = $manifest.SelectSingleNode('/f:Package/f:Applications/f:Application/f:Extensions', $ns)
  Assert-That ($null -ne $extensions) 'Application extensions are missing'
  $fileClsid = 'A07663E5-DF6F-44EA-9106-9D9B83B405AD'
  $folderClsid = '53BFF47C-5346-4B6A-B9C4-554998C0B5AC'
  $contexts = @{ '*' = $fileClsid; 'Directory' = $folderClsid; 'Directory\Background' = $folderClsid }
  foreach ($type in $contexts.Keys) {
    $verb = $extensions.SelectSingleNode("desktop4:Extension[@Category='windows.fileExplorerContextMenus']/desktop4:FileExplorerContextMenus/desktop5:ItemType[@Type='$type']/desktop5:Verb", $ns)
    Assert-That ($null -ne $verb -and $verb.Clsid -eq $contexts[$type]) "Invalid menu registration: $type"
  }
  $architecture = $root.Identity.ProcessorArchitecture
  Assert-That (@('x64', 'arm64') -contains $architecture) "Unexpected package architecture: $architecture"
  $expectedMachine = if ($architecture -eq 'x64') { 0x8664 } else { 0xaa64 }
  foreach ($clsid in @($fileClsid, $folderClsid)) {
    $class = $extensions.SelectSingleNode("com:Extension[@Category='windows.comServer']/com:ComServer/com:SurrogateServer/com:Class[@Id='$clsid']", $ns)
    Assert-That ($null -ne $class -and $class.ThreadingModel -eq 'STA') "Invalid COM class: $clsid"
    Assert-That ($class.Path -eq 'app\shell\PosemarkShell.dll') 'Unexpected shell DLL path'
    $dllEntry = $archive.GetEntry($class.Path.Replace('\', '/'))
    Assert-That ($null -ne $dllEntry) "COM DLL is absent from package: $($class.Path)"
    $stream = $dllEntry.Open()
    $memory = [System.IO.MemoryStream]::new()
    try { $stream.CopyTo($memory); $bytes = $memory.ToArray() } finally { $stream.Dispose(); $memory.Dispose() }
    Assert-That ($bytes.Length -gt 256 -and [System.BitConverter]::ToUInt16($bytes, 0) -eq 0x5a4d) 'DLL is not a PE image'
    $pe = [System.BitConverter]::ToInt32($bytes, 0x3c)
    Assert-That ([System.BitConverter]::ToUInt32($bytes, $pe) -eq 0x4550) 'Invalid PE header'
    Assert-That ([System.BitConverter]::ToUInt16($bytes, $pe + 4) -eq $expectedMachine) 'Shell DLL architecture differs from package'
    $nativeOutput = Join-Path $PSScriptRoot "../../_cache/shell/$architecture/PosemarkShell.dll"
    $hash = [System.Security.Cryptography.SHA256]::Create()
    try {
      $actualHash = [System.BitConverter]::ToString($hash.ComputeHash($bytes))
      $expectedHash = [System.BitConverter]::ToString($hash.ComputeHash([System.IO.File]::ReadAllBytes($nativeOutput)))
    } finally { $hash.Dispose() }
    Assert-That ($actualHash -eq $expectedHash) 'Packaged DLL differs from the current native build'
  }
  Assert-That ($null -ne $archive.GetEntry('app/Posemark.exe')) 'Posemark.exe is missing'
  Assert-That ($null -ne $extensions.SelectSingleNode("uap5:Extension/uap5:AppExecutionAlias/uap5:ExecutionAlias[@Alias='posemark.exe']", $ns)) 'Execution alias was lost'
  foreach ($type in @('.md', '.markdown')) {
    Assert-That ($null -ne $extensions.SelectSingleNode("uap:Extension/uap:FileTypeAssociation/uap:SupportedFileTypes/uap:FileType[text()='$type']", $ns)) "File association was lost: $type"
  }
  Write-Output "Verified Store package: $architecture; 2 COM classes; file, folder and background menus; matching DLL; file associations; execution alias."
} finally { $archive.Dispose() }
