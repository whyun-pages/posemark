// Exercise the actual native DLL without installing or modifying the user's
// existing Store app. A copied test executable captures CreateProcess argv.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shlwapi.h>
#include <shlguid.h>
#include <wrl.h>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
#include "../build/shell/commands.h"
#include "../build/shell/command-line.h"

using Microsoft::WRL::ComPtr;
using Microsoft::WRL::Make;
using Microsoft::WRL::RuntimeClass;
using Microsoft::WRL::RuntimeClassFlags;
using Microsoft::WRL::ClassicCom;
namespace fs = std::filesystem;

void Check(bool condition, const char* message) {
  if (!condition) throw std::runtime_error(message);
}
void Ok(HRESULT result, const char* message) {
  if (FAILED(result)) { std::cerr << "HRESULT: " << std::hex << result << '\n'; throw std::runtime_error(message); }
}

// A real filesystem Shell folder behind a minimal Explorer view/site. This
// tests background invocation with no selection, not a guessed working dir.
class FolderSite final : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IServiceProvider, IFolderView> {
  ComPtr<IPersistFolder2> folder_;
public:
  HRESULT Initialize(const wchar_t* path) {
    ComPtr<IShellItem> item;
    HRESULT hr = SHCreateItemFromParsingName(path, nullptr, IID_PPV_ARGS(&item));
    return SUCCEEDED(hr) ? item->BindToHandler(nullptr, BHID_SFObject, IID_PPV_ARGS(&folder_)) : hr;
  }
  IFACEMETHODIMP QueryService(REFGUID service, REFIID iid, void** result) override {
    if (service == SID_SFolderView) return QueryInterface(iid, result);
    *result = nullptr;
    return E_NOINTERFACE;
  }
  IFACEMETHODIMP GetFolder(REFIID iid, void** result) override { return folder_->QueryInterface(iid, result); }
  IFACEMETHODIMP GetCurrentViewMode(UINT*) override { return E_NOTIMPL; }
  IFACEMETHODIMP SetCurrentViewMode(UINT) override { return E_NOTIMPL; }
  IFACEMETHODIMP Item(int, PITEMID_CHILD*) override { return E_NOTIMPL; }
  IFACEMETHODIMP ItemCount(UINT, int*) override { return E_NOTIMPL; }
  IFACEMETHODIMP Items(UINT, REFIID, void**) override { return E_NOTIMPL; }
  IFACEMETHODIMP GetSelectionMarkedItem(int*) override { return E_NOTIMPL; }
  IFACEMETHODIMP GetFocusedItem(int*) override { return E_NOTIMPL; }
  IFACEMETHODIMP GetItemPosition(PCUITEMID_CHILD, POINT*) override { return E_NOTIMPL; }
  IFACEMETHODIMP GetSpacing(POINT*) override { return E_NOTIMPL; }
  IFACEMETHODIMP GetDefaultSpacing(POINT*) override { return E_NOTIMPL; }
  IFACEMETHODIMP GetAutoArrange() override { return E_NOTIMPL; }
  IFACEMETHODIMP SelectItem(int, DWORD) override { return E_NOTIMPL; }
  IFACEMETHODIMP SelectAndPositionItems(UINT, PCUITEMID_CHILD_ARRAY, POINT*, DWORD) override { return E_NOTIMPL; }
};

ComPtr<IShellItemArray> Selection(const std::vector<std::wstring>& paths) {
  std::vector<PIDLIST_ABSOLUTE> pidls;
  for (const auto& path : paths) {
    PIDLIST_ABSOLUTE pidl = nullptr;
    Ok(SHParseDisplayName(path.c_str(), nullptr, &pidl, 0, nullptr), "parse selection");
    pidls.push_back(pidl);
  }
  ComPtr<IShellItemArray> result;
  HRESULT hr = SHCreateShellItemArrayFromIDLists(static_cast<UINT>(pidls.size()),
    const_cast<PCIDLIST_ABSOLUTE*>(pidls.data()), &result);
  for (auto pidl : pidls) CoTaskMemFree(pidl);
  Ok(hr, "create selection");
  return result;
}

void AssertState(IExplorerCommand* command, IShellItemArray* items, EXPCMDSTATE expected) {
  EXPCMDSTATE state = ECS_HIDDEN;
  Check(command->GetState(items, FALSE, &state) == E_PENDING, "menu UI must defer path resolution");
  Ok(command->GetState(items, TRUE, &state), "get state");
  Check(state == expected, "unexpected command visibility");
}

void AssertLaunch(IExplorerCommand* command, IShellItemArray* selection, const fs::path& output,
                  const std::vector<std::wstring>& expected) {
  SetEnvironmentVariableW(L"POSEMARK_SHELL_CAPTURE_FILE", output.c_str());
  const HRESULT hr = command->Invoke(selection, nullptr);
  SetEnvironmentVariableW(L"POSEMARK_SHELL_CAPTURE_FILE", nullptr);
  Ok(hr, "invoke shell command");
  std::wstring line;
  for (int i = 0; i < 100; ++i) {
    std::ifstream input(output, std::ios::binary);
    if (input) {
      std::vector<char> bytes((std::istreambuf_iterator<char>(input)), {});
      if (!bytes.empty()) { line.assign(reinterpret_cast<const wchar_t*>(bytes.data()), bytes.size() / sizeof(wchar_t)); break; }
    }
    Sleep(50);
  }
  Check(!line.empty(), "child process did not capture argv");
  int count = 0;
  auto args = CommandLineToArgvW(line.c_str(), &count);
  Check(args != nullptr && count == static_cast<int>(expected.size()) + 2, "wrong argument count");
  Check(std::wstring(args[1]) == L"--", "missing argument separator");
  for (size_t i = 0; i < expected.size(); ++i) Check(args[i + 2] == expected[i], "path changed in transit");
  LocalFree(args);
}

int wmain(int argc, wchar_t** argv) {
  wchar_t capture[32768]{};
  if (GetEnvironmentVariableW(L"POSEMARK_SHELL_CAPTURE_FILE", capture, ARRAYSIZE(capture))) {
    std::ofstream output(fs::path(capture), std::ios::binary);
    const std::wstring line = GetCommandLineW();
    output.write(reinterpret_cast<const char*>(line.data()), static_cast<std::streamsize>(line.size() * sizeof(wchar_t)));
    return output ? 0 : 2;
  }
  try {
    Check(argc == 2, "pass the DLL path");
    Ok(CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED), "initialize COM");
    const fs::path source = fs::absolute(argv[1]);
    const auto fixture = source.parent_path() / (L"smoke app 中文 " + std::to_wstring(GetCurrentProcessId()) + L"-" + std::to_wstring(GetTickCount64()));
    fs::create_directories(fixture / L"shell");
    const auto dll = fixture / L"shell/PosemarkShell.dll";
    fs::copy_file(source, dll);
    wchar_t self[32768]{};
    Check(GetModuleFileNameW(nullptr, self, ARRAYSIZE(self)) != 0, "locate test executable");
    fs::copy_file(self, fixture / L"Posemark.exe");
    const auto folderPath = fixture / L"目录 with spaces";
    fs::create_directory(folderPath);
    const auto filePath = folderPath / L"文章 & notes.md";
    const auto secondPath = folderPath / L"--export.md";
    std::ofstream(filePath) << "# smoke";
    std::ofstream(secondPath) << "# smoke 2";
    HMODULE library = LoadLibraryW(dll.c_str());
    Check(library != nullptr, "load shell DLL");
    auto getClass = reinterpret_cast<HRESULT (WINAPI*)(REFCLSID, REFIID, void**)>(GetProcAddress(library, "DllGetClassObject"));
    auto canUnload = reinterpret_cast<HRESULT (WINAPI*)()>(GetProcAddress(library, "DllCanUnloadNow"));
    Check(getClass && canUnload, "missing COM exports");
    Check(canUnload() == S_OK, "fresh DLL cannot unload");
    {
      ComPtr<IClassFactory> fileFactory, folderFactory;
      Ok(getClass(CLSID_PosemarkFile, IID_PPV_ARGS(&fileFactory)), "file factory");
      Ok(getClass(CLSID_PosemarkFolder, IID_PPV_ARGS(&folderFactory)), "folder factory");
      void* unknown = nullptr;
      Check(getClass(GUID_NULL, IID_IClassFactory, &unknown) == CLASS_E_CLASSNOTAVAILABLE, "unknown CLSID accepted");
      ComPtr<IExplorerCommand> file, folder;
      Ok(fileFactory->CreateInstance(nullptr, IID_PPV_ARGS(&file)), "file command");
      Ok(folderFactory->CreateInstance(nullptr, IID_PPV_ARGS(&folder)), "folder command");
      Check(canUnload() == S_FALSE, "live COM objects do not retain DLL");
      const LANGID originalLanguage = GetThreadUILanguage();
      for (const auto language : {MAKELANGID(LANG_ENGLISH, SUBLANG_ENGLISH_US), MAKELANGID(LANG_CHINESE, SUBLANG_CHINESE_SIMPLIFIED)}) {
        SetThreadUILanguage(static_cast<LANGID>(language));
        for (auto command : {file.Get(), folder.Get()}) {
          PWSTR title = nullptr;
          Ok(command->GetTitle(nullptr, &title), "localized menu title");
          const bool chinese = PRIMARYLANGID(language) == LANG_CHINESE;
          const auto expected = command == file.Get()
            ? (chinese ? L"用 Posemark 打开" : L"Open with Posemark")
            : (chinese ? L"用 Posemark 打开文件夹" : L"Open Folder with Posemark");
          Check(title && std::wstring(title) == expected, "menu title does not follow UI language");
          CoTaskMemFree(title);
        }
      }
      SetThreadUILanguage(originalLanguage);
      PWSTR icon = nullptr;
      Ok(file->GetIcon(nullptr, &icon), "icon resource");
      const std::wstring iconPath = icon;
      Check(fs::equivalent(iconPath.substr(0, iconPath.find_last_of(L',')), dll), "icon uses host exe instead of DLL");
      CoTaskMemFree(icon);
      HICON iconHandle = nullptr;
      Check(ExtractIconExW(dll.c_str(), -IDI_POSEMARK, &iconHandle, nullptr, 1) == 1, "embedded icon missing");
      DestroyIcon(iconHandle);
      auto files = Selection({filePath.wstring(), secondPath.wstring()});
      auto dirs = Selection({folderPath.wstring()});
      AssertState(file.Get(), files.Get(), ECS_ENABLED);
      AssertState(file.Get(), dirs.Get(), ECS_HIDDEN);
      AssertState(folder.Get(), dirs.Get(), ECS_ENABLED);
      AssertState(folder.Get(), files.Get(), ECS_HIDDEN);
      AssertState(folder.Get(), nullptr, ECS_HIDDEN);
      AssertState(file.Get(), nullptr, ECS_HIDDEN);
      auto virtualItems = Selection({L"::{20D04FE0-3AEA-1069-A2D8-08002B30309D}"});
      AssertState(folder.Get(), virtualItems.Get(), ECS_HIDDEN);
      AssertLaunch(file.Get(), files.Get(), fixture / L"files.capture", {filePath.wstring(), secondPath.wstring()});
      AssertLaunch(folder.Get(), dirs.Get(), fixture / L"folder.capture", {folderPath.wstring()});
      auto rootDir = Selection({folderPath.root_path().wstring()});
      AssertLaunch(folder.Get(), rootDir.Get(), fixture / L"root.capture", {folderPath.root_path().wstring()});
      ComPtr<IObjectWithSite> withSite;
      Ok(folder.As(&withSite), "background site interface");
      auto site = Make<FolderSite>();
      Ok(site->Initialize(folderPath.c_str()), "initialize background folder");
      Ok(withSite->SetSite(static_cast<IServiceProvider*>(site.Get())), "set background site");
      AssertState(folder.Get(), nullptr, ECS_ENABLED);
      AssertLaunch(folder.Get(), nullptr, fixture / L"background.capture", {folderPath.wstring()});
      Ok(withSite->SetSite(nullptr), "clear site");
      AssertState(folder.Get(), nullptr, ECS_HIDDEN);
    }
    Check(canUnload() == S_OK, "released COM objects still retain DLL");
    FreeLibrary(library);
    // Test quoting edge cases that are not valid filenames, plus root/UNC paths.
    for (const auto& value : {L"", L"C:\\", L"\\\\server\\share\\", L"C:\\中文 path\\", L"a\\\"b", L"--help"}) {
      const auto line = L"Posemark.exe " + QuoteArgument(value);
      int count = 0;
      auto parsed = CommandLineToArgvW(line.c_str(), &count);
      Check(parsed && count == 2 && std::wstring(parsed[1]) == value, "Windows quoting round trip failed");
      LocalFree(parsed);
    }
    CoUninitialize();
    std::cout << "Native shell smoke passed: COM lifetime, resources, file/multi-file/folder/background invocation, virtual folders, Unicode paths, Windows argv quoting.\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "Native shell smoke failed: " << error.what() << '\n';
    return 1;
  }
}
