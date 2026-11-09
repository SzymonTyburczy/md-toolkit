# Privacy Policy

MD Toolkit has no servers, accounts, analytics or advertising. Your documents never leave your computer.

## What is stored

| Data | Where | Why |
| --- | --- | --- |
| Appearance and general settings | `chrome.storage.sync` | Keeps your preferences. If Chrome Sync is on, Chrome carries them to your other devices. |
| The draft in **New document** | `chrome.storage.local` | Prevents losing pasted text. It stays on this device. |
| Folders you open, up to the last 10 | IndexedDB, on this device | Lets you reopen a folder from the recent list. Only a reference to the folder is kept, never copies of your files. **Remove from this list** forgets one. |
| Which folders are expanded in the file tree | Session storage | Keeps the tree as you left it while you move between files. It is cleared when the tab closes. |

You can erase all of this by removing the extension. **Restore all defaults** on the options page resets your settings.

## Folders

Opening a folder uses Chrome's own folder picker, and Chrome asks you before MD Toolkit can read it. It asks again on the first save, before any file can be changed. MD Toolkit reads only the folder you chose and the folders inside it. Chrome lists your granted folders in its site settings, where you can revoke access.

When you open a local file, MD Toolkit also lists the folder around it, using the file access you already allowed. That listing stays in the viewer.

## What is sent over the network

MD Toolkit itself sends nothing. Two things can still cause network traffic, and both are ordinary browser behaviour:

- **Opening a web document.** The file is downloaded from its own server, including your cookies for that site, the same as visiting the page. While the tab is visible, it is checked for changes at most once every 15 seconds. You can turn this off with the auto-reload setting.
- **Remote content inside a document.** Images and other media referenced by a document load from wherever they are hosted, which tells that host the page was opened, as with any web page.

Fonts, the diagram renderer and the math renderer all ship inside the extension and are never downloaded.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| Access to `file:///*` | Reads local Markdown files. Chrome keeps this off until you turn on "Allow access to file URLs". |
| Access to `raw.githubusercontent.com`, `gist.githubusercontent.com` and `gitlab.com` | Renders raw Markdown files from these hosts. |
| Optional access to all websites | Requested only if you turn on **All other websites** on the options page. It renders `.md` files from any site. You can turn it off at any time. |
| `storage` | Saves your settings and draft. |
| `scripting` | Registers the redirect for all websites, only after you allow it. |

The content script runs only on URLs ending in a Markdown extension. It checks whether the page is plain text and hands it to the viewer. It does not read or change any other page.

MD Toolkit's viewer page is reachable from websites, because that is how a document is handed over to it. A website could use this to detect that the extension is installed. It cannot read anything from the viewer, and the viewer refuses to run inside a frame.

## Contact

Please open an issue at <https://github.com/SzymonTyburczy/md-toolkit/issues>.
