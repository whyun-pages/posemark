#pragma once
#include <guiddef.h>

// Stable package registrations. Keep these in sync with appx/extensions.xml.
inline constexpr GUID CLSID_PosemarkFile =
    {0xa07663e5, 0xdf6f, 0x44ea, {0x91, 0x06, 0x9d, 0x9b, 0x83, 0xb4, 0x05, 0xad}};
inline constexpr GUID CLSID_PosemarkFolder =
    {0x53bff47c, 0x5346, 0x4b6a, {0xb9, 0xc4, 0x55, 0x49, 0x98, 0xc0, 0xb5, 0xac}};

#define IDI_POSEMARK 101
#define IDS_OPEN_FILE 201
#define IDS_OPEN_FOLDER 202
