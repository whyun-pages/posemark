#pragma once
#include <string>
#include <string_view>

// Windows argv quoting: backslashes preceding a quote (including the closing
// quote) must be doubled. In particular, "C:\\" must not consume that quote.
inline std::wstring QuoteArgument(std::wstring_view value) {
  std::wstring result = L"\"";
  size_t slashes = 0;
  for (wchar_t c : value) {
    if (c == L'\\') {
      ++slashes;
      continue;
    }
    result.append(slashes * (c == L'"' ? 2 : 1), L'\\');
    slashes = 0;
    if (c == L'"') result += L'\\';
    result += c;
  }
  result.append(slashes * 2, L'\\');
  result += L'"';
  return result;
}
