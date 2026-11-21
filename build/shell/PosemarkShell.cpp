#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <shlobj.h>
#include <shlwapi.h>
#include <shlguid.h>
#include <wrl.h>
#include <algorithm>
#include <atomic>
#include <new>
#include <string>
#include <vector>
#include "commands.h"
#include "command-line.h"

using Microsoft::WRL::ComPtr;
using Microsoft::WRL::RuntimeClass;
using Microsoft::WRL::RuntimeClassFlags;
using Microsoft::WRL::ClassicCom;

namespace {
HMODULE moduleHandle = nullptr;
std::atomic<long> objects{0};
std::atomic<long> serverLocks{0};

template <typename F> HRESULT Guard(F&& action) noexcept {
  try { return action(); }
  catch (const std::bad_alloc&) { return E_OUTOFMEMORY; }
  catch (...) { return E_FAIL; }
}

std::wstring ModulePath() {
  std::wstring path(512, L'\0');
  for (;;) {
    const DWORD length = GetModuleFileNameW(moduleHandle, path.data(), static_cast<DWORD>(path.size()));
    if (!length) return {};
    if (length < path.size()) { path.resize(length); return path; }
    if (path.size() >= 32768) return {};
    path.resize((std::min)(path.size() * 2, size_t{32768}));
  }
}

HRESULT FileSystemPath(IShellItem* item, bool folder, std::wstring& path) {
  if (!item) return E_INVALIDARG;
  SFGAOF attributes = 0;
  HRESULT hr = item->GetAttributes(SFGAO_FILESYSTEM | SFGAO_FOLDER, &attributes);
  if (FAILED(hr)) return hr;
  if (!(attributes & SFGAO_FILESYSTEM) || !!(attributes & SFGAO_FOLDER) != folder)
    return HRESULT_FROM_WIN32(ERROR_NOT_SUPPORTED);
  PWSTR value = nullptr;
  hr = item->GetDisplayName(SIGDN_FILESYSPATH, &value);
  if (SUCCEEDED(hr)) {
    // Free COM memory even if allocating the string throws.
    try { path = value; }
    catch (...) { CoTaskMemFree(value); throw; }
  }
  CoTaskMemFree(value);
  return hr;
}

HRESULT CurrentFolder(IUnknown* site, std::wstring& path) {
  if (!site) return E_FAIL;
  ComPtr<IFolderView> view;
  HRESULT hr = IUnknown_QueryService(site, SID_SFolderView, IID_PPV_ARGS(&view));
  if (FAILED(hr)) {
    ComPtr<IShellBrowser> browser;
    hr = IUnknown_QueryService(site, SID_STopLevelBrowser, IID_PPV_ARGS(&browser));
    if (FAILED(hr)) return hr;
    ComPtr<IShellView> shellView;
    hr = browser->QueryActiveShellView(&shellView);
    if (FAILED(hr)) return hr;
    hr = shellView.As(&view);
    if (FAILED(hr)) return hr;
  }
  // Shell folders need not implement IShellItem; IPersistFolder2 gives us the
  // absolute PIDL, which can be turned into a filesystem IShellItem.
  ComPtr<IPersistFolder2> folder;
  hr = view->GetFolder(IID_PPV_ARGS(&folder));
  if (FAILED(hr)) return hr;
  PIDLIST_ABSOLUTE pidl = nullptr;
  hr = folder->GetCurFolder(&pidl);
  if (FAILED(hr)) return hr;
  ComPtr<IShellItem> item;
  hr = SHCreateItemFromIDList(pidl, IID_PPV_ARGS(&item));
  CoTaskMemFree(pidl);
  return SUCCEEDED(hr) ? FileSystemPath(item.Get(), true, path) : hr;
}

HRESULT Launch(const std::vector<std::wstring>& paths) {
  std::wstring executable = ModulePath();
  if (executable.empty()) return E_FAIL;
  executable.resize(executable.find_last_of(L"\\/")); // app\shell
  executable.resize(executable.find_last_of(L"\\/")); // app
  executable += L"\\Posemark.exe";
  std::wstring command = QuoteArgument(executable) + L" --";
  for (const auto& path : paths) command += L" " + QuoteArgument(path);
  // CreateProcess includes the terminating NUL in its 32767-character limit.
  if (command.size() >= 32767) return HRESULT_FROM_WIN32(ERROR_FILENAME_EXCED_RANGE);
  STARTUPINFOW startup{sizeof(startup)};
  PROCESS_INFORMATION process{};
  if (!CreateProcessW(executable.c_str(), command.data(), nullptr, nullptr, FALSE,
                      0, nullptr, nullptr, &startup, &process))
    return HRESULT_FROM_WIN32(GetLastError());
  CloseHandle(process.hThread);
  CloseHandle(process.hProcess);
  return S_OK;
}

class Command final : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IExplorerCommand, IObjectWithSite> {
  bool folder_;
  ComPtr<IUnknown> site_;

  HRESULT Paths(IShellItemArray* selection, std::vector<std::wstring>& paths) {
    DWORD count = 0;
    if (selection) {
      HRESULT hr = selection->GetCount(&count);
      if (FAILED(hr)) return hr;
    }
    if (count == 0) {
      if (!folder_) return E_INVALIDARG;
      std::wstring path;
      HRESULT hr = CurrentFolder(site_.Get(), path);
      if (SUCCEEDED(hr)) paths.push_back(std::move(path));
      return hr;
    }
    for (DWORD i = 0; i < count; ++i) {
      ComPtr<IShellItem> item;
      HRESULT hr = selection->GetItemAt(i, &item);
      if (FAILED(hr)) return hr;
      std::wstring path;
      hr = FileSystemPath(item.Get(), folder_, path);
      if (FAILED(hr)) return hr;
      paths.push_back(std::move(path));
    }
    return S_OK;
  }

public:
  explicit Command(bool folder) noexcept : folder_(folder) { ++objects; }
  ~Command() { --objects; }
  IFACEMETHODIMP GetTitle(IShellItemArray*, PWSTR* title) override {
    if (!title) return E_POINTER;
    *title = nullptr;
    wchar_t text[128]{};
    if (!LoadStringW(moduleHandle, folder_ ? IDS_OPEN_FOLDER : IDS_OPEN_FILE, text, ARRAYSIZE(text)))
      return E_FAIL;
    return SHStrDupW(text, title);
  }
  IFACEMETHODIMP GetIcon(IShellItemArray*, PWSTR* icon) override {
    if (!icon) return E_POINTER;
    *icon = nullptr;
    return Guard([&]() -> HRESULT {
      const auto module = ModulePath();
      return module.empty() ? E_FAIL : SHStrDupW((module + L",-101").c_str(), icon);
    });
  }
  IFACEMETHODIMP GetToolTip(IShellItemArray*, PWSTR* tooltip) override {
    if (!tooltip) return E_POINTER;
    *tooltip = nullptr;
    return E_NOTIMPL;
  }
  IFACEMETHODIMP GetCanonicalName(GUID* name) override {
    if (!name) return E_POINTER;
    *name = folder_ ? CLSID_PosemarkFolder : CLSID_PosemarkFile;
    return S_OK;
  }
  IFACEMETHODIMP GetState(IShellItemArray* selection, BOOL okToBeSlow, EXPCMDSTATE* state) override {
    if (!state) return E_POINTER;
    *state = ECS_HIDDEN;
    // Resolving shell items (especially a UNC folder) can block. Ask Explorer
    // to repeat on its worker thread instead of doing I/O on the menu UI path.
    if (!okToBeSlow) return E_PENDING;
    return Guard([&]() -> HRESULT {
      std::vector<std::wstring> paths;
      if (SUCCEEDED(Paths(selection, paths))) *state = ECS_ENABLED;
      return S_OK;
    });
  }
  IFACEMETHODIMP Invoke(IShellItemArray* selection, IBindCtx*) override {
    return Guard([&]() -> HRESULT {
      std::vector<std::wstring> paths;
      HRESULT hr = Paths(selection, paths);
      return SUCCEEDED(hr) ? Launch(paths) : hr;
    });
  }
  IFACEMETHODIMP GetFlags(EXPCMDFLAGS* flags) override {
    if (!flags) return E_POINTER;
    *flags = ECF_DEFAULT;
    return S_OK;
  }
  IFACEMETHODIMP EnumSubCommands(IEnumExplorerCommand** commands) override {
    if (!commands) return E_POINTER;
    *commands = nullptr;
    return E_NOTIMPL;
  }
  IFACEMETHODIMP SetSite(IUnknown* site) override { site_ = site; return S_OK; }
  IFACEMETHODIMP GetSite(REFIID iid, void** result) override {
    if (!result) return E_POINTER;
    *result = nullptr;
    return site_ ? site_->QueryInterface(iid, result) : E_FAIL;
  }
};

class Factory final : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IClassFactory> {
  bool folder_;
public:
  explicit Factory(bool folder) noexcept : folder_(folder) { ++objects; }
  ~Factory() { --objects; }
  IFACEMETHODIMP CreateInstance(IUnknown* outer, REFIID iid, void** result) override {
    if (!result) return E_POINTER;
    *result = nullptr;
    if (outer) return CLASS_E_NOAGGREGATION;
    auto command = Microsoft::WRL::Make<Command>(folder_);
    return command ? command.CopyTo(iid, result) : E_OUTOFMEMORY;
  }
  IFACEMETHODIMP LockServer(BOOL lock) override {
    if (lock) ++serverLocks; else --serverLocks;
    return S_OK;
  }
};
} // namespace

BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID) {
  if (reason == DLL_PROCESS_ATTACH) moduleHandle = instance;
  return TRUE;
}

extern "C" HRESULT __stdcall DllGetClassObject(REFCLSID clsid, REFIID iid, void** result) {
  if (!result) return E_POINTER;
  *result = nullptr;
  if (clsid != CLSID_PosemarkFile && clsid != CLSID_PosemarkFolder) return CLASS_E_CLASSNOTAVAILABLE;
  auto factory = Microsoft::WRL::Make<Factory>(clsid == CLSID_PosemarkFolder);
  return factory ? factory.CopyTo(iid, result) : E_OUTOFMEMORY;
}

extern "C" HRESULT __stdcall DllCanUnloadNow() {
  return objects.load() == 0 && serverLocks.load() == 0 ? S_OK : S_FALSE;
}
