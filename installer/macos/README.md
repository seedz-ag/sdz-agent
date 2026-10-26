# macOS installer (.pkg)

Build (on a Mac, Xcode command line tools required):

```bash
scripts/publish.sh osx-arm64 osx-x64
installer/macos/build-pkg.sh osx-arm64
installer/macos/build-pkg.sh osx-x64
```

Produces `artifacts/sdz-agent-<version>-<rid>.pkg`, which installs:

| Path | Content |
|---|---|
| `/opt/sdz-agent/sdz-agent` | self-contained binary |
| `/Library/LaunchDaemons/ag.seedz.sdz-agent.plist` | LaunchDaemon (`sdz-agent run`, KeepAlive) |
| `/var/lib/sdz-agent/` | data dir (`.env`, `output/`, `logs/`) |
| `/usr/local/bin/sdz-agent` | symlink for the CLI |
| `/opt/sdz-agent/sdz-agent-tray` + `/Library/LaunchAgents/ag.seedz.sdz-agent-tray.plist` | tray app, started for every user at login (menu bar icon: status, credentials, run now) |

After installing: enter the credentials in the tray app, or `sudo sdz-agent configure`
(writes `.env`). The daemon runs idle until configured.

## Signing and notarization

Without a **Developer ID Installer** certificate and notarization, Gatekeeper
shows "cannot be opened because it is from an unidentified developer" and the
user must allow it under Privacy & Security. To ship without that friction the
Seedz Apple Developer account must provide:

- a "Developer ID Installer" certificate in the build keychain
  (`SIGN_IDENTITY="Developer ID Installer: Seedz (TEAMID)"`);
- a "Developer ID Application" certificate to codesign the binary itself
  (`codesign --sign "Developer ID Application: ..." --options runtime --timestamp artifacts/publish/<rid>/sdz-agent`)
  before running `build-pkg.sh`;
- notarytool credentials stored as a keychain profile
  (`xcrun notarytool store-credentials sdz-agent --apple-id ... --team-id ... --password <app-specific>`),
  passed as `NOTARY_PROFILE=sdz-agent`.

The release workflow runs these steps only when the corresponding secrets exist.
